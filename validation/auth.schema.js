import { z } from "zod";

export const registerSchema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(7),
  whatsapp: z.string().min(7),
  address: z.string().min(5),
  referralCode: z.string().optional(),
  deviceId: z.string().optional(),
  refreshToken: z.string().optional()
});