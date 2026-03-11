import { findProduct } from '../products/product-lookup';
import { calculateAnnualFee, industryAverageFee } from '../products/fee-calculator';
import type { FeeStructure, InvestmentOption } from '../products/fee-calculator';
import type { InputRequest } from '@/types/agent';

interface ComparisonProfile {
  super_fund_name?: string;
  super_balance?: number;
  date_of_birth_year?: number;
  [key: string]: unknown;
}

interface FundSummary {
  name: string;
  annual_fee: number;
}

export interface ComparisonResultData {
  user_fund: FundSummary;
  comparison_fund: FundSummary;
  gap: number;
  balance: number;
}

export interface ComparisonResponse {
  input_request?: InputRequest;
  comparison_result?: ComparisonResultData;
  message?: string;
}

const DEFAULT_BALANCE = 50_000;

function extractComparisonTarget(message: string): string {
  const match =
    message.match(/(?:compare|compared)\s+(?:with|to|against)\s+(.+?)(?:\?|$)/i) ??
    message.match(/(?:vs|versus)\s+(.+?)(?:\?|$)/i);

  return match ? match[1].trim() : 'the market';
}

export async function buildComparisonResponse(
  message: string,
  profile: ComparisonProfile,
): Promise<ComparisonResponse> {
  if (!profile.super_fund_name) {
    return {
      input_request: {
        type: 'chips',
        field: 'super_fund_name',
        required: true,
        label: 'YOUR SUPER FUND',
        hint: 'Which super fund are you with?',
      },
      message: 'Which super fund are you currently with?',
    };
  }

  const balance = (profile.super_balance as number) ?? DEFAULT_BALANCE;
  const birthYear = profile.date_of_birth_year;

  const userFund = await findProduct(profile.super_fund_name);
  const targetName = extractComparisonTarget(message);
  const comparisonFund = await findProduct(targetName);

  const userFee = userFund
    ? calculateAnnualFee(
        { ...(userFund.fee_structure as FeeStructure), investment_options: (userFund.investment_options as InvestmentOption[]) ?? [] },
        balance,
        undefined,
        birthYear,
      )
    : industryAverageFee(balance);

  const compFee = comparisonFund
    ? calculateAnnualFee(
        { ...(comparisonFund.fee_structure as FeeStructure), investment_options: (comparisonFund.investment_options as InvestmentOption[]) ?? [] },
        balance,
        undefined,
        birthYear,
      )
    : industryAverageFee(balance);

  return {
    comparison_result: {
      user_fund: { name: profile.super_fund_name, annual_fee: userFee },
      comparison_fund: {
        name: comparisonFund?.name ?? targetName,
        annual_fee: compFee,
      },
      gap: userFee - compFee,
      balance,
    },
  };
}
