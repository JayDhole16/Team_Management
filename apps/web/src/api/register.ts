import {
  ClaimResponseSchema,
  ConsentResponseSchema,
  RegisterCompleteResponseSchema,
  type ClaimResponse,
  type ConsentResponse,
  type RegisterCompleteBody,
  type RegisterCompleteResponse,
} from '@lk/shared';
import { apiGet, apiPost } from './client';

export const claimCode = (code: string): Promise<ClaimResponse> =>
  apiPost('/register/claim', ClaimResponseSchema, { code }, { auth: false });

export const fetchConsent = (): Promise<ConsentResponse> =>
  apiGet('/register/consent', ConsentResponseSchema, { auth: false });

export const completeRegistration = (
  body: RegisterCompleteBody,
): Promise<RegisterCompleteResponse> =>
  apiPost('/register/complete', RegisterCompleteResponseSchema, body, { auth: false });
