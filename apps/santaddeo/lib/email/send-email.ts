/**
 * @deprecated Wrapper di compatibilita'. Usa direttamente `sendEmail` da `@/lib/email`.
 * Mantenuto solo per evitare di rompere import esistenti. Ridireziona alla
 * implementazione canonica in lib/email.ts (con audit log + dev redirect).
 */
export { sendEmail } from "../email"
export type { SendEmailArgs, SendEmailResult } from "../email"
