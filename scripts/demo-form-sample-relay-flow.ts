/**
 * Pass 7 demo: fixture-driven form_sample → relay observations → mock coach analysis
 * on the **local laptop** (coach Node). Run: npm run demo:relay
 */
import {runFixtureRelayDemo} from '../relay/runFixtureRelayDemo';

function printLifecycleTable(rows: {event_kind: string; message_id: string; status: string; preview: string}[]) {
  const wKind = Math.max(
    'event_kind'.length,
    ...rows.map(r => r.event_kind.length),
  );
  const wMsg = Math.max(
    'message_id'.length,
    ...rows.map(r => r.message_id.length),
  );
  const wStatus = Math.max(
    'status'.length,
    ...rows.map(r => r.status.length),
  );

  const header = `${'event_kind'.padEnd(wKind)}  ${'message_id'.padEnd(wMsg)}  ${'status'.padEnd(wStatus)}  payload_preview (truncated)`;
  const line = '-'.repeat(header.length);

  // eslint-disable-next-line no-console
  console.log('\n--- Relay lifecycle (Pass 7) ---\n');
  // eslint-disable-next-line no-console
  console.log(header);
  // eslint-disable-next-line no-console
  console.log(line);

  for (const r of rows) {
    const prev =
      r.preview.length > 72 ? `${r.preview.slice(0, 72)}…` : r.preview;
    // eslint-disable-next-line no-console
    console.log(
      `${r.event_kind.padEnd(wKind)}  ${r.message_id.padEnd(wMsg)}  ${r.status.padEnd(wStatus)}  ${prev}`,
    );
  }
}

async function main() {
  const {recorder, formSample, coachAnalysis} = await runFixtureRelayDemo();
  const observations = recorder.validateAll();

  printLifecycleTable(
    observations.map(o => ({
      event_kind: o.event_kind,
      message_id: o.message_id,
      status: o.status,
      preview: o.payload_preview,
    })),
  );

  // eslint-disable-next-line no-console
  console.log('\n--- Full observations JSON ---\n');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(observations, null, 2));

  // eslint-disable-next-line no-console
  console.log('\n--- Correlated messages ---\n');
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        form_sample_message_id: formSample.message_id,
        coach_analysis_message_id: coachAnalysis.message_id,
      },
      null,
      2,
    ),
  );
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
