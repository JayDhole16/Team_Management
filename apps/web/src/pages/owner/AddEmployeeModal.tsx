import type { DeviceMode } from '@lk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { createInvite, revokeCode } from '../../api/codes';
import { listJobRoles } from '../../api/jobRoles';
import { CodePanel } from '../../components/CodePanel';
import { Button, ErrorBox, Field, Modal, SelectField } from '../../components/ui';
import { DEVICE_MODE_LABEL } from '../../lib/labels';

const DEVICE_HELP: Record<DeviceMode, string> = {
  COMPANY_MACBOOK: 'Only approved apps and websites can be used on it (from a later update).',
  PERSONAL: 'Never restricted. Only work time is tracked.',
};

/**
 * "Add new employee": the owner sets the device mode (required, no default), an optional job
 * role (locked for the employee) and a note, then gets a one-time code.
 */
export function AddEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ['job-roles'], queryFn: listJobRoles, enabled: open });
  const [deviceMode, setDeviceMode] = useState<DeviceMode | null>(null);
  const [roleId, setRoleId] = useState('');
  const [note, setNote] = useState('');
  const [showError, setShowError] = useState(false);
  // gcTime 0: the plain code is not kept in the mutation cache after this modal closes.
  const invite = useMutation({ mutationFn: createInvite, gcTime: 0 });

  function close() {
    // The code is being created: closing now would leave a live code nobody saw.
    if (invite.isPending) return;
    invite.reset();
    setDeviceMode(null);
    setRoleId('');
    setNote('');
    setShowError(false);
    void queryClient.invalidateQueries({ queryKey: ['codes'] });
    onClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!deviceMode) {
      setShowError(true);
      return;
    }
    invite.mutate({
      deviceMode,
      ...(roleId ? { presetJobRoleId: roleId } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  return (
    <Modal open={open} title="Add new employee" onClose={close}>
      {invite.data ? (
        <CodePanel
          created={invite.data}
          onRevoke={() => revokeCode(invite.data.id)}
          onDone={close}
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-800">Device type (required)</legend>
            {(Object.keys(DEVICE_MODE_LABEL) as DeviceMode[]).map((mode) => (
              <label
                key={mode}
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${deviceMode === mode ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}
              >
                <input
                  type="radio"
                  name="deviceMode"
                  className="mt-1 h-5 w-5"
                  checked={deviceMode === mode}
                  onChange={() => setDeviceMode(mode)}
                />
                <span>
                  <span className="block text-sm font-medium">{DEVICE_MODE_LABEL[mode]}</span>
                  <span className="block text-xs text-gray-600">{DEVICE_HELP[mode]}</span>
                </span>
              </label>
            ))}
            {showError && !deviceMode && (
              <p className="text-sm text-red-700">Choose the device type.</p>
            )}
          </fieldset>
          <SelectField
            label="Job role (optional)"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            hint="If you choose one, the employee cannot change it."
          >
            <option value="">Employee chooses</option>
            {roles.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </SelectField>
          <Field
            label="Note (optional)"
            maxLength={120}
            placeholder="e.g. Rahul, video editor"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="Only you see this, in the Invites list."
          />
          <ErrorBox error={invite.error} />
          <Button type="submit" className="w-full" loading={invite.isPending}>
            Generate code
          </Button>
        </form>
      )}
    </Modal>
  );
}
