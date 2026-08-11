import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from "../../constants/financial/supportedCurrencies";

export interface CurrencyMetadata {
  code: SupportedCurrency;
  displayName: string;
  symbol: string;
  minorUnits: number;
  enabled: boolean;
}

const metadata: Record<SupportedCurrency, CurrencyMetadata> = {
  USD: { code: "USD", displayName: "US Dollar", symbol: "$", minorUnits: 2, enabled: true },
  EUR: { code: "EUR", displayName: "Euro", symbol: "€", minorUnits: 2, enabled: true },
  GBP: { code: "GBP", displayName: "Pound Sterling", symbol: "£", minorUnits: 2, enabled: true },
  INR: { code: "INR", displayName: "Indian Rupee", symbol: "₹", minorUnits: 2, enabled: true },
  AUD: { code: "AUD", displayName: "Australian Dollar", symbol: "A$", minorUnits: 2, enabled: true },
  CAD: { code: "CAD", displayName: "Canadian Dollar", symbol: "C$", minorUnits: 2, enabled: true },
  SGD: { code: "SGD", displayName: "Singapore Dollar", symbol: "S$", minorUnits: 2, enabled: true },
  JPY: { code: "JPY", displayName: "Japanese Yen", symbol: "¥", minorUnits: 0, enabled: true },
  CNY: { code: "CNY", displayName: "Chinese Yuan", symbol: "¥", minorUnits: 2, enabled: true },
  HKD: { code: "HKD", displayName: "Hong Kong Dollar", symbol: "HK$", minorUnits: 2, enabled: true },
  CHF: { code: "CHF", displayName: "Swiss Franc", symbol: "CHF", minorUnits: 2, enabled: true },
  SEK: { code: "SEK", displayName: "Swedish Krona", symbol: "kr", minorUnits: 2, enabled: true },
  NZD: { code: "NZD", displayName: "New Zealand Dollar", symbol: "NZ$", minorUnits: 2, enabled: true },
  MXN: { code: "MXN", displayName: "Mexican Peso", symbol: "MX$", minorUnits: 2, enabled: true },
  BRL: { code: "BRL", displayName: "Brazilian Real", symbol: "R$", minorUnits: 2, enabled: true },
  ZAR: { code: "ZAR", displayName: "South African Rand", symbol: "R", minorUnits: 2, enabled: true },
  KRW: { code: "KRW", displayName: "South Korean Won", symbol: "₩", minorUnits: 0, enabled: true },
  TRY: { code: "TRY", displayName: "Turkish Lira", symbol: "₺", minorUnits: 2, enabled: true },
  AED: { code: "AED", displayName: "UAE Dirham", symbol: "د.إ", minorUnits: 2, enabled: true },
  SAR: { code: "SAR", displayName: "Saudi Riyal", symbol: "ر.س", minorUnits: 2, enabled: true },
  THB: { code: "THB", displayName: "Thai Baht", symbol: "฿", minorUnits: 2, enabled: true },
  MYR: { code: "MYR", displayName: "Malaysian Ringgit", symbol: "RM", minorUnits: 2, enabled: true },
  IDR: { code: "IDR", displayName: "Indonesian Rupiah", symbol: "Rp", minorUnits: 2, enabled: true },
  PHP: { code: "PHP", displayName: "Philippine Peso", symbol: "₱", minorUnits: 2, enabled: true },
  VND: { code: "VND", displayName: "Vietnamese Dong", symbol: "₫", minorUnits: 0, enabled: true },
  PKR: { code: "PKR", displayName: "Pakistani Rupee", symbol: "₨", minorUnits: 2, enabled: true },
  BDT: { code: "BDT", displayName: "Bangladeshi Taka", symbol: "৳", minorUnits: 2, enabled: true },
  LKR: { code: "LKR", displayName: "Sri Lankan Rupee", symbol: "Rs", minorUnits: 2, enabled: true },
  NPR: { code: "NPR", displayName: "Nepalese Rupee", symbol: "रु", minorUnits: 2, enabled: true },
};

export class CurrencyMetadataService {
  normalize(value: string): SupportedCurrency {
    const code = value.trim().toUpperCase() as SupportedCurrency;
    if (!SUPPORTED_CURRENCIES.includes(code) || !metadata[code]?.enabled) {
      throw new Error("Currency is unsupported.");
    }
    return code;
  }

  get(code: string): CurrencyMetadata {
    return { ...metadata[this.normalize(code)] };
  }

  listEnabled(): CurrencyMetadata[] {
    return SUPPORTED_CURRENCIES
      .filter((code) => metadata[code].enabled)
      .map((code) => ({ ...metadata[code] }));
  }
}

export const currencyMetadataService = new CurrencyMetadataService();
