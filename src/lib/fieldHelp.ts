/** Help text for form fields (#884), shown by `HelpTooltip`. */
export const FIELD_HELP_DOCS = '/faq#lifecycle';

export const FIELD_HELP = {
  tokenAddress: {
    label: 'Token contract address',
    text: 'The Stellar contract (C…) of the token this will holds, usually USDC. Funds are locked in the SoroWill contract until they are released.',
  },
  amount: {
    label: 'Amount',
    text: 'How much to lock in the will now. You can top it up later from the will page.',
  },
  checkinPeriod: {
    label: 'Check-in period',
    text: 'How often you must check in to prove you are active. If you miss the deadline, the will can be triggered.',
  },
  gracePeriod: {
    label: 'Grace period',
    text: 'Extra time after the will is triggered before funds are released, so you or a guardian can still cancel.',
  },
  beneficiaries: {
    label: 'Beneficiaries',
    text: 'The Stellar addresses that receive the funds, and each one\'s share. Shares must add up to 100%.',
  },
  guardians: {
    label: 'Guardians',
    text: 'Optional trusted addresses that can confirm or dispute a trigger on your behalf.',
  },
} as const;
