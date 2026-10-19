import type { TaskPriority, TaskStatus } from '@lk/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { PRIORITY, TASK_STATUS } from '../lib/labels';
import { Badge } from './ui';

export function TaskStatusBadge({
  status,
  unsent = false,
}: {
  status: TaskStatus;
  unsent?: boolean;
}) {
  if (unsent) return <Badge tone="amber">Not sent yet</Badge>;
  const { label, tone } = TASK_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { label, tone } = PRIORITY[priority];
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * Task, summary and AI text. Always a plain text node (never HTML: LLM output is untrusted),
 * keeping the writer's line breaks.
 */
export function PlainText({ text, className = '' }: { text: string; className?: string }) {
  return <p className={`break-words whitespace-pre-wrap ${className}`}>{text}</p>;
}

/** After any task change: refresh every list that shows tasks. */
export function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        ['projects', 'project', 'tasks', 'my-tasks'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
    [queryClient],
  );
}
