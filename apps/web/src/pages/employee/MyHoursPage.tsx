import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { serverNow } from '../../api/clock';
import { fetchMonthHours } from '../../api/reports';
import { MonthHoursView, MonthPicker, SessionList } from '../../components/HoursViews';
import { Card, ErrorBox, PageHeader, Spinner } from '../../components/ui';
import { istMonth } from '../../lib/time';

export function MyHoursPage() {
  const [month, setMonth] = useState(() => istMonth(serverNow()));
  const hours = useQuery({
    queryKey: ['my-hours', month],
    queryFn: () => fetchMonthHours({ month }),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="My hours" />
      <MonthPicker month={month} maxMonth={istMonth(serverNow())} onChange={setMonth} />
      {hours.isPending && <Spinner label="Loading…" />}
      <ErrorBox error={hours.error} />
      {hours.data && (
        <>
          <MonthHoursView data={hours.data} />
          <Card>
            <h2 className="mb-2 font-semibold">Sessions and breaks</h2>
            <SessionList data={hours.data} />
          </Card>
        </>
      )}
    </div>
  );
}
