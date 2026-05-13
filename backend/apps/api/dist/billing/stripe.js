import Stripe from 'stripe';
export const billingPlans = [
    {
        id: 'pro',
        name: 'Pro',
        description: 'For solo builders converting and exporting Gutenberg projects regularly.',
        priceCents: 1900,
        currency: 'usd',
        interval: 'month',
        lookupKey: 'forma_pro_monthly',
        trialDays: 7,
        features: ['Unlimited project conversions', 'Gutenberg ZIP exports', 'AI suggestions', 'Public project publishing']
    },
    {
        id: 'studio',
        name: 'Studio',
        description: 'For teams and agencies shipping higher-volume client work.',
        priceCents: 4900,
        currency: 'usd',
        interval: 'month',
        lookupKey: 'forma_studio_monthly',
        trialDays: 7,
        features: ['Everything in Pro', 'Higher usage limits', 'Team-ready billing', 'Priority export workflow']
    }
];
export function getBillingPlan(planId) {
    return billingPlans.find((plan) => plan.id === planId);
}
export function getBillingPlanByLookupKey(lookupKey) {
    return billingPlans.find((plan) => plan.lookupKey === lookupKey);
}
export function createStripeClient(env) {
    if (!env.STRIPE_SECRET_KEY)
        return null;
    return new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2026-04-22.dahlia',
        typescript: true
    });
}
export async function ensureStripePrice(stripe, plan) {
    const existing = await stripe.prices.list({
        lookup_keys: [plan.lookupKey],
        active: true,
        limit: 1
    });
    const price = existing.data[0];
    if (price)
        return price;
    return stripe.prices.create({
        currency: plan.currency,
        unit_amount: plan.priceCents,
        lookup_key: plan.lookupKey,
        recurring: { interval: plan.interval },
        product_data: {
            name: `Forma ${plan.name}`,
            metadata: { plan: plan.id }
        },
        metadata: { plan: plan.id }
    });
}
export function publicPlan(plan) {
    return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        interval: plan.interval,
        trialDays: plan.trialDays,
        features: plan.features
    };
}
//# sourceMappingURL=stripe.js.map