export const INTERACTION_TYPES = [
  { value: 'PHONE_CALL', label: 'Phone Call' },
  { value: 'WHATSAPP',   label: 'WhatsApp' },
  { value: 'EMAIL',      label: 'Email' },
  { value: 'LINKEDIN',   label: 'LinkedIn' },
  { value: 'OTHER',      label: 'Other' },
] as const;

export const INTERACTION_DIRECTIONS = [
  { value: 'INCOMING', label: 'Incoming (They contacted me)' },
  { value: 'OUTGOING', label: 'Outgoing (I contacted them)' },
] as const;
