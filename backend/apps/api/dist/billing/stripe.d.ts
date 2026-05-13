import Stripe from 'stripe';
import type { Env } from '../config/env.js';
export type BillingPlanId = 'pro' | 'studio';
export type BillingPlan = {
    id: BillingPlanId;
    name: string;
    description: string;
    priceCents: number;
    currency: 'usd';
    interval: 'month';
    lookupKey: string;
    trialDays: number;
    features: string[];
};
export declare const billingPlans: BillingPlan[];
export declare function getBillingPlan(planId: string): BillingPlan | undefined;
export declare function getBillingPlanByLookupKey(lookupKey: string | null | undefined): BillingPlan | undefined;
export declare function createStripeClient(env: Env): Stripe | null;
export declare function ensureStripePrice(stripe: Stripe, plan: BillingPlan): Promise<Stripe.Price>;
export declare function publicPlan(plan: BillingPlan): {
    id: BillingPlanId;
    name: string;
    description: string;
    priceCents: number;
    currency: "usd";
    interval: "month";
    trialDays: number;
    features: string[];
};
//# sourceMappingURL=stripe.d.ts.map