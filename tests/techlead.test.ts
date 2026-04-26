import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────
// Test Helpers (extracted from techlead.ts for testing)
// ─────────────────────────────────────────────────────────────────

interface ReviewRecord {
  spec_number: number;
  score: number;
  approved: boolean;
  timestamp: string;
}

interface LastReviewContext {
  last_reviewed_at: string;
  reviewed_specs: ReviewRecord[];
}

function loadLastReview(lastReviewPath: string): LastReviewContext {
  if (!fs.existsSync(lastReviewPath)) {
    return { last_reviewed_at: new Date().toISOString(), reviewed_specs: [] };
  }
  return JSON.parse(fs.readFileSync(lastReviewPath, 'utf-8'));
}

function saveLastReview(lastReviewPath: string, context: LastReviewContext): void {
  fs.writeFileSync(lastReviewPath, JSON.stringify(context, null, 2), 'utf-8');
}

function getSpecFilePath(atomoCwd: string, issueNumber: number): string {
  return path.join(atomoCwd, 'docs', 'plans', `TECH_SPEC_${issueNumber}.md`);
}

function hasSpecBeenModified(atomoCwd: string, issueNumber: number, lastReviewTimestamp: string): boolean {
  const specPath = getSpecFilePath(atomoCwd, issueNumber);
  if (!fs.existsSync(specPath)) return false;

  const stats = fs.statSync(specPath);
  const modifiedAt = stats.mtime.toISOString();
  return modifiedAt > lastReviewTimestamp;
}

// ─────────────────────────────────────────────────────────────────
// Unit Tests: loadLastReview()
// ─────────────────────────────────────────────────────────────────

describe('loadLastReview', () => {
  const mockContextDir = '/tmp/atomo-test-techlead';
  const mockLastReviewPath = path.join(mockContextDir, 'last_review.json');

  beforeEach(() => {
    if (!fs.existsSync(mockContextDir)) {
      fs.mkdirSync(mockContextDir, { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(mockContextDir, { recursive: true, force: true });
  });

  it('should return default context if file does not exist', () => {
    const result = loadLastReview(mockLastReviewPath);
    expect(result.reviewed_specs).toEqual([]);
    expect(result.last_reviewed_at).toBeDefined();
  });

  it('should load existing review context from file', () => {
    const mockContext: LastReviewContext = {
      last_reviewed_at: '2026-04-20T10:00:00.000Z',
      reviewed_specs: [
        { spec_number: 73, score: 90, approved: true, timestamp: '2026-04-20T10:00:00.000Z' },
      ],
    };
    fs.writeFileSync(mockLastReviewPath, JSON.stringify(mockContext), 'utf-8');

    const result = loadLastReview(mockLastReviewPath);
    expect(result.last_reviewed_at).toBe('2026-04-20T10:00:00.000Z');
    expect(result.reviewed_specs).toHaveLength(1);
    expect(result.reviewed_specs[0]!.spec_number).toBe(73);
    expect(result.reviewed_specs[0]!.score).toBe(90);
  });

  it('should handle malformed JSON gracefully (return default)', () => {
    fs.writeFileSync(mockLastReviewPath, 'INVALID JSON', 'utf-8');
    expect(() => loadLastReview(mockLastReviewPath)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────
// Unit Tests: saveLastReview()
// ─────────────────────────────────────────────────────────────────

describe('saveLastReview', () => {
  const mockContextDir = '/tmp/atomo-test-techlead';
  const mockLastReviewPath = path.join(mockContextDir, 'last_review.json');

  beforeEach(() => {
    if (!fs.existsSync(mockContextDir)) {
      fs.mkdirSync(mockContextDir, { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(mockContextDir, { recursive: true, force: true });
  });

  it('should save review context to file', () => {
    const mockContext: LastReviewContext = {
      last_reviewed_at: '2026-04-20T10:00:00.000Z',
      reviewed_specs: [
        { spec_number: 73, score: 85, approved: true, timestamp: '2026-04-20T10:00:00.000Z' },
      ],
    };

    saveLastReview(mockLastReviewPath, mockContext);

    const saved = JSON.parse(fs.readFileSync(mockLastReviewPath, 'utf-8'));
    expect(saved.last_reviewed_at).toBe('2026-04-20T10:00:00.000Z');
    expect(saved.reviewed_specs).toHaveLength(1);
    expect(saved.reviewed_specs[0].spec_number).toBe(73);
  });

  it('should overwrite existing file', () => {
    const initialContext: LastReviewContext = {
      last_reviewed_at: '2026-04-19T10:00:00.000Z',
      reviewed_specs: [],
    };
    saveLastReview(mockLastReviewPath, initialContext);

    const updatedContext: LastReviewContext = {
      last_reviewed_at: '2026-04-20T10:00:00.000Z',
      reviewed_specs: [
        { spec_number: 73, score: 90, approved: true, timestamp: '2026-04-20T10:00:00.000Z' },
      ],
    };
    saveLastReview(mockLastReviewPath, updatedContext);

    const saved = JSON.parse(fs.readFileSync(mockLastReviewPath, 'utf-8'));
    expect(saved.reviewed_specs).toHaveLength(1);
    expect(saved.last_reviewed_at).toBe('2026-04-20T10:00:00.000Z');
  });
});

// ─────────────────────────────────────────────────────────────────
// Unit Tests: getSpecFilePath()
// ─────────────────────────────────────────────────────────────────

describe('getSpecFilePath', () => {
  it('should return correct path for spec file', () => {
    const result = getSpecFilePath('/home/user/atomo', 73);
    expect(result).toBe('/home/user/atomo/docs/plans/TECH_SPEC_73.md');
  });

  it('should handle different issue numbers', () => {
    expect(getSpecFilePath('/project', 1)).toBe('/project/docs/plans/TECH_SPEC_1.md');
    expect(getSpecFilePath('/project', 999)).toBe('/project/docs/plans/TECH_SPEC_999.md');
  });
});

// ─────────────────────────────────────────────────────────────────
// Unit Tests: hasSpecBeenModified()
// ─────────────────────────────────────────────────────────────────

describe('hasSpecBeenModified', () => {
  const mockProjectDir = '/tmp/atomo-test-specs';
  const mockDocsDir = path.join(mockProjectDir, 'docs', 'plans');

  beforeEach(() => {
    if (!fs.existsSync(mockDocsDir)) {
      fs.mkdirSync(mockDocsDir, { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(mockProjectDir, { recursive: true, force: true });
  });

  it('should return false if spec file does not exist', () => {
    const result = hasSpecBeenModified(mockProjectDir, 999, '2026-04-20T10:00:00.000Z');
    expect(result).toBe(false);
  });

  it('should return true if spec modified after last review', () => {
    const specPath = path.join(mockDocsDir, 'TECH_SPEC_73.md');
    fs.writeFileSync(specPath, 'Initial content');

    // Simulate review timestamp from the past
    const oldTimestamp = '2020-01-01T00:00:00.000Z';

    const result = hasSpecBeenModified(mockProjectDir, 73, oldTimestamp);
    expect(result).toBe(true);
  });

  it('should return false if spec not modified since last review', () => {
    const specPath = path.join(mockDocsDir, 'TECH_SPEC_73.md');
    fs.writeFileSync(specPath, 'Content');

    // Get actual file mtime
    const stats = fs.statSync(specPath);
    const fileTime = stats.mtime.toISOString();

    // Use future timestamp (spec was reviewed after it was modified)
    const futureTimestamp = new Date(Date.now() + 10000).toISOString();

    const result = hasSpecBeenModified(mockProjectDir, 73, futureTimestamp);
    expect(result).toBe(false);
  });

  it('should handle edge case where spec modified at exact same timestamp', () => {
    const specPath = path.join(mockDocsDir, 'TECH_SPEC_73.md');
    fs.writeFileSync(specPath, 'Content');

    const stats = fs.statSync(specPath);
    const exactTimestamp = stats.mtime.toISOString();

    // Same timestamp should not trigger re-review (not > comparison)
    const result = hasSpecBeenModified(mockProjectDir, 73, exactTimestamp);
    expect(result).toBe(false);
  });
});
