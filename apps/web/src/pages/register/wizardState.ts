import {
  INVALID_CODE_MESSAGE,
  type ClaimResponse,
  type DeviceMode,
  type RegisterCompleteBody,
} from '@lk/shared';
import { ApiError } from '../../api/errors';

export type Step = 'code' | 'details' | 'consent' | 'face' | 'done';

export const STEP_TITLES: Record<Step, string> = {
  code: 'Enter your code',
  details: 'Your details',
  consent: 'Consent',
  face: 'Face scan',
  done: 'Done',
};
export const STEP_ORDER: Step[] = ['code', 'details', 'consent', 'face', 'done'];

export interface Details {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  jobRoleId: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  /** "This is the MacBook Leaders Key gave me" / "This is my own laptop". Never sent. */
  deviceConfirmed: boolean;
}

export const emptyDetails: Details = {
  name: '',
  email: '',
  password: '',
  passwordConfirm: '',
  jobRoleId: '',
  phone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  deviceConfirmed: false,
};

/** Kept in React state only: the password and token never go to browser storage. */
export interface WizardState {
  step: Step;
  claim: ClaimResponse | null;
  details: Details;
  consentVersion: string | null;
  error: string | null;
  registeredDeviceMode: DeviceMode | null;
}

export const initialWizard: WizardState = {
  step: 'code',
  claim: null,
  details: emptyDetails,
  consentVersion: null,
  error: null,
  registeredDeviceMode: null,
};

export type WizardAction =
  | { type: 'claimed'; claim: ClaimResponse }
  | { type: 'details'; details: Details }
  | { type: 'consent'; version: string }
  | { type: 'back' }
  | { type: 'failed'; code: string; message: string }
  | { type: 'registered'; deviceMode: DeviceMode };

export const EMAIL_TAKEN_MESSAGE =
  'This email is already registered. Use another email or contact the owner.';

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'claimed':
      return {
        ...initialWizard,
        step: 'details',
        claim: action.claim,
        details: { ...emptyDetails, jobRoleId: action.claim.presetJobRoleId ?? '' },
      };
    case 'details':
      return { ...state, step: 'consent', details: action.details, error: null };
    case 'consent':
      return { ...state, step: 'face', consentVersion: action.version, error: null };
    case 'back':
      // No way back to the code step: the code is already used up by the claim.
      if (state.step === 'consent') return { ...state, step: 'details', error: null };
      if (state.step === 'face') return { ...state, step: 'consent', error: null };
      return state;
    case 'failed':
      return failed(state, action.code, action.message);
    case 'registered':
      // Forget everything typed, including the password.
      return { ...initialWizard, step: 'done', registeredDeviceMode: action.deviceMode };
  }
}

function failed(state: WizardState, code: string, message: string): WizardState {
  switch (code) {
    case 'INVALID_CODE':
      // The registration window ran out (or the code was revoked): start again with a new code.
      return { ...initialWizard, error: INVALID_CODE_MESSAGE };
    case 'EMAIL_TAKEN':
      return { ...state, step: 'details', error: EMAIL_TAKEN_MESSAGE };
    case 'WEAK_PASSWORD':
    case 'JOB_ROLE_LOCKED':
    case 'UNKNOWN_JOB_ROLE':
    case 'VALIDATION_ERROR':
      return { ...state, step: 'details', error: message };
    case 'CONSENT_OUTDATED':
      return {
        ...state,
        step: 'consent',
        consentVersion: null,
        error: 'The consent text has changed. Please read it again.',
      };
    default:
      // Network trouble or a server fault: stay put; finishing again is safe (idempotent).
      return {
        ...state,
        error:
          code === 'NETWORK_ERROR'
            ? 'Cannot reach the server. Check your connection and try again.'
            : message,
      };
  }
}

/** The message for a failed code claim. Every invalid-code case shows the SAME text. */
export function claimErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'RATE_LIMITED')
      return 'Too many attempts. Please wait 15 minutes and try again.';
    if (err.code === 'NETWORK_ERROR')
      return 'Cannot reach the server. Check your connection and try again.';
  }
  return INVALID_CODE_MESSAGE;
}

/** The body for POST /register/complete. Device mode is never sent (the server takes it from the code). */
export function buildCompleteBody(state: WizardState): RegisterCompleteBody {
  if (!state.claim || !state.consentVersion) throw new Error('Wizard is not ready to finish');
  const d = state.details;
  return {
    token: state.claim.registrationToken,
    name: d.name.trim(),
    email: d.email.trim(),
    password: d.password,
    jobRoleId: d.jobRoleId,
    phone: d.phone.trim(),
    emergencyContactName: d.emergencyContactName.trim(),
    emergencyContactPhone: d.emergencyContactPhone.trim(),
    consentAccepted: true,
    consentVersion: state.consentVersion,
  };
}
