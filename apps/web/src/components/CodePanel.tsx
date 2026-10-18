import { formatCode, normalizeCode, type CodeCreated } from '@lk/shared';
import { useRef, useState } from 'react';
import { serverNow } from '../api/clock';
import { useNow } from '../hooks/useNow';
import { formatCountdown } from '../lib/time';
import { remainingSec } from '../lib/timer';
import { Button, ErrorBox, Notice } from './ui';

const PURPOSE_TEXT: Record<CodeCreated['purpose'], string> = {
  INVITE: 'Give this code to the new employee. They enter it under "Register as employee".',
  PASSWORD_RESET:
    'Give this code to the employee. They enter it under "Forgot password" with a new password.',
  FACE_RESCAN: 'Give this code to the employee. They enter it to scan their face again.',
};

/**
 * Shows a newly created access code ONCE. Only a hash is stored on the server, so after this
 * panel closes the code cannot be shown again. The caller keeps `created` in memory only.
 */
export function CodePanel({
  created,
  onRevoke,
  onDone,
}: {
  created: CodeCreated;
  onRevoke: () => Promise<unknown>;
  onDone: () => void;
}) {
  const now = useNow();
  const left = remainingSec(created.expiresAt, serverNow(now));
  const codeRef = useRef<HTMLParagraphElement>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // The server may send the code with or without the dash; always show it as XXXX-XXXX.
  const display = formatCode(normalizeCode(created.code));

  async function copy() {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
    } catch {
      // No clipboard access (e.g. plain http): select the code so the owner can copy it.
      const node = codeRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      await onRevoke();
      setRevoked(true);
    } catch (err) {
      setError(err);
    } finally {
      setRevoking(false);
    }
  }

  const dead = revoked || left === 0;

  return (
    <div className="space-y-4" data-testid="code-panel">
      <p className="text-sm text-gray-700">{PURPOSE_TEXT[created.purpose]}</p>
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-center">
        <p
          ref={codeRef}
          data-testid="access-code"
          className={`font-mono text-4xl font-bold tracking-widest select-all ${dead ? 'text-gray-400 line-through' : 'text-gray-900'}`}
        >
          {display}
        </p>
        <p className="mt-2 text-sm text-gray-700" aria-live="polite">
          {revoked
            ? 'Revoked. This code no longer works.'
            : left === 0
              ? 'Expired. Generate a new code.'
              : `Expires in ${formatCountdown(left)}`}
        </p>
      </div>
      <Notice tone="amber">
        This code is shown only once. After you close this, it cannot be shown again.
      </Notice>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void copy()} disabled={dead}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void revoke()}
          loading={revoking}
          disabled={dead}
        >
          Revoke
        </Button>
      </div>
      <Button variant="secondary" className="w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
