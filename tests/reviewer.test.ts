import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  readDeltaEvents,
  aggregateByAgent,
  formatStats,
  type JsonlEvent,
  type AgentStats,
} from '../src/reviewer.js';

// ─────────────────────────────────────────────────────────────────
// Unit Tests: readDeltaEvents()
// ─────────────────────────────────────────────────────────────────

describe('readDeltaEvents', () => {
  const mockEventsDir = '/tmp/atomo-test-events';

  beforeEach(() => {
    // Create temp directory for test JSONL files
    if (!fs.existsSync(mockEventsDir)) {
      fs.mkdirSync(mockEventsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup temp files
    fs.rmSync(mockEventsDir, { recursive: true, force: true });
  });

  it('should return empty array if events directory does not exist', () => {
    const result = readDeltaEvents('/nonexistent/path', '2026-04-01T00:00:00.000Z');
    expect(result).toEqual([]);
  });

  it('should filter events by date (since parameter)', () => {
    // Create test JSONL file: 2026-04-20.jsonl
    const testFile = path.join(mockEventsDir, '2026-04-20.jsonl');
    const events = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'run1', agent: 'Gatekeeper', event: 'run_start' },
      { ts: '2026-04-20T11:00:00.000Z', run_id: 'run2', agent: 'Architect', event: 'run_start' },
      { ts: '2026-04-20T12:00:00.000Z', run_id: 'run3', agent: 'Dev', event: 'run_complete', status: 'ok' },
    ];
    fs.writeFileSync(testFile, events.map(e => JSON.stringify(e)).join('\n'));

    // Query since 11:30 (should only get run3)
    const result = readDeltaEvents(mockEventsDir, '2026-04-20T11:30:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0]!.run_id).toBe('run3');
  });

  it('should skip files entirely before since date (whole-day optimization)', () => {
    // Create old file: 2026-04-01.jsonl
    const oldFile = path.join(mockEventsDir, '2026-04-01.jsonl');
    fs.writeFileSync(oldFile, '{"ts":"2026-04-01T10:00:00.000Z","run_id":"old","agent":"Gatekeeper","event":"run_start"}');

    // Create recent file: 2026-04-20.jsonl
    const newFile = path.join(mockEventsDir, '2026-04-20.jsonl');
    fs.writeFileSync(newFile, '{"ts":"2026-04-20T10:00:00.000Z","run_id":"new","agent":"Architect","event":"run_start"}');

    // Query since 2026-04-15 (should skip 2026-04-01.jsonl entirely)
    const result = readDeltaEvents(mockEventsDir, '2026-04-15T00:00:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0]!.run_id).toBe('new');
  });

  it('should handle malformed JSONL lines gracefully (skip, not crash)', () => {
    const testFile = path.join(mockEventsDir, '2026-04-20.jsonl');
    const content = [
      '{"ts":"2026-04-20T10:00:00.000Z","run_id":"valid1","agent":"Gatekeeper","event":"run_start"}',
      'MALFORMED JSON LINE HERE',
      '{"ts":"2026-04-20T11:00:00.000Z","run_id":"valid2","agent":"Architect","event":"run_start"}',
      '', // empty line
      '{"incomplete": "missing required fields"}', // valid JSON but missing ts
    ].join('\n');
    fs.writeFileSync(testFile, content);

    const result = readDeltaEvents(mockEventsDir, '2026-04-20T00:00:00.000Z');
    // Should only get the 2 valid events (malformed line skipped, empty line filtered out)
    expect(result).toHaveLength(2);
    expect(result[0]!.run_id).toBe('valid1');
    expect(result[1]!.run_id).toBe('valid2');
  });

  it('should handle multiple JSONL files and sort chronologically', () => {
    // Create files in non-chronological order
    fs.writeFileSync(
      path.join(mockEventsDir, '2026-04-22.jsonl'),
      '{"ts":"2026-04-22T10:00:00.000Z","run_id":"day3","agent":"Dev","event":"run_start"}'
    );
    fs.writeFileSync(
      path.join(mockEventsDir, '2026-04-20.jsonl'),
      '{"ts":"2026-04-20T10:00:00.000Z","run_id":"day1","agent":"Gatekeeper","event":"run_start"}'
    );
    fs.writeFileSync(
      path.join(mockEventsDir, '2026-04-21.jsonl'),
      '{"ts":"2026-04-21T10:00:00.000Z","run_id":"day2","agent":"Architect","event":"run_start"}'
    );

    const result = readDeltaEvents(mockEventsDir, '2026-04-20T00:00:00.000Z');
    expect(result).toHaveLength(3);
    // Files should be processed in chronological order (sorted by filename)
    expect(result[0]!.run_id).toBe('day1');
    expect(result[1]!.run_id).toBe('day2');
    expect(result[2]!.run_id).toBe('day3');
  });
});

// ─────────────────────────────────────────────────────────────────
// Unit Tests: aggregateByAgent()
// ─────────────────────────────────────────────────────────────────

describe('aggregateByAgent', () => {
  it('should return empty object for empty event list', () => {
    const result = aggregateByAgent([]);
    expect(result).toEqual({});
  });

  it('should aggregate events by agent name', () => {
    const events: JsonlEvent[] = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'r1', agent: 'Gatekeeper', event: 'run_start' },
      { ts: '2026-04-20T10:01:00.000Z', run_id: 'r1', agent: 'Gatekeeper', event: 'tool_call', tool: 'Bash' },
      { ts: '2026-04-20T10:05:00.000Z', run_id: 'r1', agent: 'Gatekeeper', event: 'run_complete', status: 'ok', input_tokens: 1000, output_tokens: 500, duration_ms: 30000 },
      { ts: '2026-04-20T11:00:00.000Z', run_id: 'r2', agent: 'Architect', event: 'run_start' },
    ];

    const result = aggregateByAgent(events);

    expect(Object.keys(result)).toEqual(['Gatekeeper', 'Architect']);
    expect(result['Gatekeeper']!.runs).toBe(1);
    expect(result['Gatekeeper']!.okRuns).toBe(1);
    expect(result['Architect']!.runs).toBe(1);
    expect(result['Architect']!.okRuns).toBe(0); // no run_complete yet
  });

  it('should count tool calls by name', () => {
    const events: JsonlEvent[] = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'r1', agent: 'Architect', event: 'run_start' },
      { ts: '2026-04-20T10:01:00.000Z', run_id: 'r1', agent: 'Architect', event: 'tool_call', tool: 'Read' },
      { ts: '2026-04-20T10:02:00.000Z', run_id: 'r1', agent: 'Architect', event: 'tool_call', tool: 'Grep' },
      { ts: '2026-04-20T10:03:00.000Z', run_id: 'r1', agent: 'Architect', event: 'tool_call', tool: 'Read' },
      { ts: '2026-04-20T10:04:00.000Z', run_id: 'r1', agent: 'Architect', event: 'tool_call', tool: 'Write' },
    ];

    const result = aggregateByAgent(events);

    expect(result['Architect']!.toolCallsByName).toEqual({
      Read: 2,
      Grep: 1,
      Write: 1
    });
  });

  it('should accumulate reasoning chars and block count', () => {
    const events: JsonlEvent[] = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'r1', agent: 'Dev', event: 'run_start' },
      { ts: '2026-04-20T10:01:00.000Z', run_id: 'r1', agent: 'Dev', event: 'reasoning', chars: 500 },
      { ts: '2026-04-20T10:02:00.000Z', run_id: 'r1', agent: 'Dev', event: 'reasoning', chars: 750 },
      { ts: '2026-04-20T10:03:00.000Z', run_id: 'r1', agent: 'Dev', event: 'reasoning', chars: 1000 },
    ];

    const result = aggregateByAgent(events);

    expect(result['Dev']!.reasoningCharsTotal).toBe(2250);
    expect(result['Dev']!.reasoningBlockCount).toBe(3);
  });

  it('should track API errors separately', () => {
    const events: JsonlEvent[] = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'r1', agent: 'Dev', event: 'run_start' },
      { ts: '2026-04-20T10:01:00.000Z', run_id: 'r1', agent: 'Dev', event: 'api_error', type: 'rate_limit' },
      { ts: '2026-04-20T10:02:00.000Z', run_id: 'r1', agent: 'Dev', event: 'api_error', type: 'overload' },
      { ts: '2026-04-20T10:05:00.000Z', run_id: 'r1', agent: 'Dev', event: 'run_complete', status: 'error', input_tokens: 1000, output_tokens: 0, duration_ms: 50000 },
    ];

    const result = aggregateByAgent(events);

    expect(result['Dev']!.apiErrors).toBe(2);
    expect(result['Dev']!.okRuns).toBe(0);
    expect(result['Dev']!.errorRuns).toBe(1);
  });

  it('should accumulate tokens from run_complete events', () => {
    const events: JsonlEvent[] = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'r1', agent: 'Gatekeeper', event: 'run_start' },
      { ts: '2026-04-20T10:05:00.000Z', run_id: 'r1', agent: 'Gatekeeper', event: 'run_complete', status: 'ok', input_tokens: 1000, output_tokens: 500, duration_ms: 30000 },
      { ts: '2026-04-20T11:00:00.000Z', run_id: 'r2', agent: 'Gatekeeper', event: 'run_start' },
      { ts: '2026-04-20T11:05:00.000Z', run_id: 'r2', agent: 'Gatekeeper', event: 'run_complete', status: 'ok', input_tokens: 1500, output_tokens: 750, duration_ms: 45000 },
    ];

    const result = aggregateByAgent(events);

    expect(result['Gatekeeper']!.totalInputTokens).toBe(2500);
    expect(result['Gatekeeper']!.totalOutputTokens).toBe(1250);
    expect(result['Gatekeeper']!.durationMs).toEqual([30000, 45000]);
  });

  it('should handle null token values gracefully', () => {
    const events: JsonlEvent[] = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'r1', agent: 'Architect', event: 'run_start' },
      { ts: '2026-04-20T10:05:00.000Z', run_id: 'r1', agent: 'Architect', event: 'run_complete', status: 'ok', input_tokens: null, output_tokens: null, duration_ms: 30000 },
    ];

    const result = aggregateByAgent(events);

    // Null tokens should be treated as 0
    expect(result['Architect']!.totalInputTokens).toBe(0);
    expect(result['Architect']!.totalOutputTokens).toBe(0);
  });

  it('should handle multiple agents in same event stream', () => {
    const events: JsonlEvent[] = [
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'r1', agent: 'Gatekeeper', event: 'run_start' },
      { ts: '2026-04-20T10:05:00.000Z', run_id: 'r1', agent: 'Gatekeeper', event: 'run_complete', status: 'ok', input_tokens: 1000, output_tokens: 500, duration_ms: 30000 },
      { ts: '2026-04-20T10:10:00.000Z', run_id: 'r2', agent: 'Architect', event: 'run_start' },
      { ts: '2026-04-20T10:15:00.000Z', run_id: 'r2', agent: 'Architect', event: 'run_complete', status: 'ok', input_tokens: 2000, output_tokens: 1000, duration_ms: 60000 },
    ];

    const result = aggregateByAgent(events);

    expect(Object.keys(result).sort()).toEqual(['Architect', 'Gatekeeper']);
    expect(result['Gatekeeper']!.runs).toBe(1);
    expect(result['Architect']!.runs).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────
// Unit Tests: formatStats()
// ─────────────────────────────────────────────────────────────────

describe('formatStats', () => {
  it('should return placeholder message for empty stats', () => {
    const result = formatStats({});
    expect(result).toBe('(no agent runs in delta)');
  });

  it('should format single agent stats correctly', () => {
    const stats: Record<string, AgentStats> = {
      Gatekeeper: {
        agentName: 'Gatekeeper',
        runs: 2,
        okRuns: 2,
        errorRuns: 0,
        totalInputTokens: 2500,
        totalOutputTokens: 1250,
        toolCallsByName: { Bash: 5, Read: 2 },
        reasoningCharsTotal: 5000,
        reasoningBlockCount: 10,
        apiErrors: 0,
        durationMs: [30000, 45000],
      }
    };

    const result = formatStats(stats);

    expect(result).toContain('Agent: Gatekeeper');
    expect(result).toContain('runs: 2');
    expect(result).toContain('ok_runs: 2');
    expect(result).toContain('error_runs: 0');
    expect(result).toContain('total_input_tokens: 2500');
    expect(result).toContain('total_output_tokens: 1250');
    expect(result).toContain('tool_calls_by_name: { Bash: 5, Read: 2 }');
    expect(result).toContain('reasoning_chars_total: 5000');
    expect(result).toContain('reasoning_block_count: 10');
    expect(result).toContain('api_errors: 0');
    expect(result).toContain('durations_ms: [30000, 45000]');
  });

  it('should handle agent with no tool calls', () => {
    const stats: Record<string, AgentStats> = {
      Dev: {
        agentName: 'Dev',
        runs: 1,
        okRuns: 0,
        errorRuns: 1,
        totalInputTokens: 1000,
        totalOutputTokens: 0,
        toolCallsByName: {},
        reasoningCharsTotal: 2000,
        reasoningBlockCount: 5,
        apiErrors: 1,
        durationMs: [60000],
      }
    };

    const result = formatStats(stats);

    expect(result).toContain('tool_calls_by_name: { none }');
  });

  it('should format multiple agents with double newline separation', () => {
    const stats: Record<string, AgentStats> = {
      Gatekeeper: {
        agentName: 'Gatekeeper',
        runs: 1,
        okRuns: 1,
        errorRuns: 0,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        toolCallsByName: { Bash: 3 },
        reasoningCharsTotal: 2000,
        reasoningBlockCount: 5,
        apiErrors: 0,
        durationMs: [30000],
      },
      Architect: {
        agentName: 'Architect',
        runs: 1,
        okRuns: 1,
        errorRuns: 0,
        totalInputTokens: 2000,
        totalOutputTokens: 1000,
        toolCallsByName: { Read: 10, Grep: 5 },
        reasoningCharsTotal: 5000,
        reasoningBlockCount: 15,
        apiErrors: 0,
        durationMs: [90000],
      }
    };

    const result = formatStats(stats);

    // Should have two agent blocks separated by double newline
    expect(result).toContain('Agent: Gatekeeper');
    expect(result).toContain('Agent: Architect');
    expect(result.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────
// Integration Tests: End-to-End Workflow
// ─────────────────────────────────────────────────────────────────

describe('Reviewer Integration', () => {
  const mockEventsDir = '/tmp/atomo-test-events-integration';

  beforeEach(() => {
    if (!fs.existsSync(mockEventsDir)) {
      fs.mkdirSync(mockEventsDir, { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(mockEventsDir, { recursive: true, force: true });
  });

  it('should process delta from JSONL files end-to-end', () => {
    // Create realistic JSONL file
    const testFile = path.join(mockEventsDir, '2026-04-20.jsonl');
    const events = [
      // Gatekeeper run
      { ts: '2026-04-20T10:00:00.000Z', run_id: 'gk1', agent: 'Gatekeeper', event: 'run_start' },
      { ts: '2026-04-20T10:01:00.000Z', run_id: 'gk1', agent: 'Gatekeeper', event: 'tool_call', tool: 'Bash' },
      { ts: '2026-04-20T10:02:00.000Z', run_id: 'gk1', agent: 'Gatekeeper', event: 'reasoning', chars: 500 },
      { ts: '2026-04-20T10:05:00.000Z', run_id: 'gk1', agent: 'Gatekeeper', event: 'run_complete', status: 'ok', input_tokens: 1000, output_tokens: 500, duration_ms: 30000 },

      // Architect run
      { ts: '2026-04-20T11:00:00.000Z', run_id: 'arch1', agent: 'Architect', event: 'run_start' },
      { ts: '2026-04-20T11:01:00.000Z', run_id: 'arch1', agent: 'Architect', event: 'tool_call', tool: 'Read' },
      { ts: '2026-04-20T11:02:00.000Z', run_id: 'arch1', agent: 'Architect', event: 'tool_call', tool: 'Grep' },
      { ts: '2026-04-20T11:03:00.000Z', run_id: 'arch1', agent: 'Architect', event: 'reasoning', chars: 1000 },
      { ts: '2026-04-20T11:10:00.000Z', run_id: 'arch1', agent: 'Architect', event: 'run_complete', status: 'ok', input_tokens: 2000, output_tokens: 1000, duration_ms: 60000 },
    ];
    fs.writeFileSync(testFile, events.map(e => JSON.stringify(e)).join('\n'));

    // Execute full pipeline
    const deltaEvents = readDeltaEvents(mockEventsDir, '2026-04-20T00:00:00.000Z');
    const stats = aggregateByAgent(deltaEvents);
    const formatted = formatStats(stats);

    // Verify output
    expect(deltaEvents).toHaveLength(9);
    expect(Object.keys(stats)).toEqual(['Gatekeeper', 'Architect']);
    expect(stats['Gatekeeper']!.okRuns).toBe(1);
    expect(stats['Architect']!.okRuns).toBe(1);
    expect(formatted).toContain('Agent: Gatekeeper');
    expect(formatted).toContain('Agent: Architect');
  });

  it('should handle empty delta gracefully', () => {
    // Create file with old events only
    const testFile = path.join(mockEventsDir, '2026-04-01.jsonl');
    fs.writeFileSync(testFile, '{"ts":"2026-04-01T10:00:00.000Z","run_id":"old","agent":"Gatekeeper","event":"run_start"}');

    // Query for recent delta (should be empty)
    const deltaEvents = readDeltaEvents(mockEventsDir, '2026-04-20T00:00:00.000Z');
    const stats = aggregateByAgent(deltaEvents);
    const formatted = formatStats(stats);

    expect(deltaEvents).toHaveLength(0);
    expect(stats).toEqual({});
    expect(formatted).toBe('(no agent runs in delta)');
  });
});
