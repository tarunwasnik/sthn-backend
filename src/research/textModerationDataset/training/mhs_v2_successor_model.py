"""Research-only dual-head XLM-R model for the frozen T6L-8E successor run."""
from dataclasses import dataclass
from typing import Optional


AUXILIARY_WEIGHT = 0.25
CATEGORY_TO_ID = {
    "ABUSIVE_OR_HARASSING": 0,
    "HATE": 1,
    "PROFANITY": 2,
    "SEXUAL": 3,
    "THREAT_OR_VIOLENCE": 4,
}


@dataclass
class ObjectiveComponents:
    loss: object
    binary_loss: object
    auxiliary_loss: object
    auxiliary_eligible_count: int


def compute_multitask_objective(binary_logits, auxiliary_logits, labels, auxiliary_labels, auxiliary_mask):
    """Compute the frozen objective without ever calling CE on an empty tensor."""
    import torch
    import torch.nn.functional as functional

    binary_loss = functional.cross_entropy(binary_logits, labels)
    eligible = auxiliary_mask.to(dtype=torch.bool)
    eligible_count = int(eligible.sum().item())
    if eligible_count:
        auxiliary_loss = functional.cross_entropy(auxiliary_logits[eligible], auxiliary_labels[eligible])
    else:
        # Keep a valid, differentiable zero on the auxiliary head's device/dtype.
        auxiliary_loss = auxiliary_logits.sum() * 0.0
    loss = binary_loss + AUXILIARY_WEIGHT * auxiliary_loss
    return ObjectiveComponents(loss, binary_loss, auxiliary_loss, eligible_count)


def build_successor_model_class():
    """Import Transformers lazily so preparation and preflight never instantiate a model."""
    import torch
    from transformers.modeling_outputs import SequenceClassifierOutput
    from transformers.models.xlm_roberta.modeling_xlm_roberta import (
        XLMRobertaClassificationHead,
        XLMRobertaModel,
        XLMRobertaPreTrainedModel,
    )

    class XLMRobertaForBinaryAndAuxiliaryClassification(XLMRobertaPreTrainedModel):
        _keys_to_ignore_on_load_missing = [r"binary_head", r"auxiliary_head"]

        def __init__(self, config):
            super().__init__(config)
            self.num_labels = 2
            self.roberta = XLMRobertaModel(config, add_pooling_layer=False)
            self.binary_head = XLMRobertaClassificationHead(config)
            auxiliary_config = type(config).from_dict(config.to_dict())
            auxiliary_config.num_labels = 5
            self.auxiliary_head = XLMRobertaClassificationHead(auxiliary_config)
            self.post_init()
            self.last_objective_components = None

        def reset_task_heads(self, seed: int):
            """Explicitly initialize both heads after the frozen seed is established."""
            with torch.random.fork_rng(devices=[]):
                torch.manual_seed(seed)
                for head in (self.binary_head, self.auxiliary_head):
                    for module in head.modules():
                        if isinstance(module, torch.nn.Linear):
                            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
                            if module.bias is not None:
                                torch.nn.init.zeros_(module.bias)
            return self

        def forward(
            self,
            input_ids=None,
            attention_mask=None,
            labels=None,
            auxiliary_labels=None,
            auxiliary_mask=None,
            return_dict: Optional[bool] = None,
            **kwargs,
        ):
            return_dict = self.config.use_return_dict if return_dict is None else return_dict
            outputs = self.roberta(
                input_ids=input_ids,
                attention_mask=attention_mask,
                return_dict=return_dict,
                **kwargs,
            )
            sequence_output = outputs[0]
            binary_logits = self.binary_head(sequence_output)
            auxiliary_logits = self.auxiliary_head(sequence_output)
            loss = None
            if labels is not None:
                if auxiliary_labels is None or auxiliary_mask is None:
                    raise ValueError("auxiliary labels and mask are required with binary labels")
                components = compute_multitask_objective(
                    binary_logits, auxiliary_logits, labels, auxiliary_labels, auxiliary_mask
                )
                self.last_objective_components = components
                # Training optimizes the combined objective. Validation loss remains the
                # frozen binary checkpoint tie-break authority.
                loss = components.loss if self.training else components.binary_loss
            if not return_dict:
                return ((loss,) if loss is not None else ()) + (binary_logits,) + outputs[2:]
            return SequenceClassifierOutput(
                loss=loss,
                logits=binary_logits,
                hidden_states=outputs.hidden_states,
                attentions=outputs.attentions,
            )

    return XLMRobertaForBinaryAndAuxiliaryClassification
