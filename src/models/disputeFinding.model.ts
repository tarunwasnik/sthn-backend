import crypto from "node:crypto";
import mongoose, { Schema, Types } from "mongoose";

export type DisputeFindingSubject = "CUSTOMER" | "CREATOR" | "BOTH";
export type DisputeFindingCategory = "SERVICE_DELIVERY" | "SERVICE_SCOPE" | "PARTICIPANT_CONDUCT" | "SAFETY" | "PRIVACY_RECORDING" | "ADDITIONAL_PARTICIPANT" | "LOCATION" | "EVIDENCE_INTEGRITY" | "PLATFORM_POLICY" | "OTHER";
export type DisputeFindingConclusion = "SUPPORTED" | "NOT_SUPPORTED" | "INCONCLUSIVE";

export interface IDisputeFinding extends mongoose.Document { findingReference:string; disputeId:Types.ObjectId; bookingId:Types.ObjectId; subject:DisputeFindingSubject; category:DisputeFindingCategory; conclusion:DisputeFindingConclusion; summary:string; createdBy:Types.ObjectId; createdAt:Date; updatedAt:Date; }
const schema=new Schema<IDisputeFinding>({findingReference:{type:String,required:true,unique:true,immutable:true,index:true,default:()=>`DISPUTE_FINDING_${crypto.randomBytes(10).toString("hex").toUpperCase()}`},disputeId:{type:Schema.Types.ObjectId,ref:"Dispute",required:true,immutable:true,index:true},bookingId:{type:Schema.Types.ObjectId,ref:"Booking",required:true,immutable:true,index:true},subject:{type:String,enum:["CUSTOMER","CREATOR","BOTH"],required:true,immutable:true},category:{type:String,enum:["SERVICE_DELIVERY","SERVICE_SCOPE","PARTICIPANT_CONDUCT","SAFETY","PRIVACY_RECORDING","ADDITIONAL_PARTICIPANT","LOCATION","EVIDENCE_INTEGRITY","PLATFORM_POLICY","OTHER"],required:true,immutable:true},conclusion:{type:String,enum:["SUPPORTED","NOT_SUPPORTED","INCONCLUSIVE"],required:true,immutable:true},summary:{type:String,required:true,trim:true,minlength:1,maxlength:2000,immutable:true},createdBy:{type:Schema.Types.ObjectId,ref:"User",required:true,immutable:true}},{timestamps:true});
schema.index({disputeId:1,createdAt:1,_id:1});
export const DisputeFinding=mongoose.model<IDisputeFinding>("DisputeFinding",schema);
