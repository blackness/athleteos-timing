-- ═══════════════════════════════════════════════════════════════
-- AthletOS Race Timing — Supabase Migration
-- ═══════════════════════════════════════════════════════════════
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- This creates the race_finishes table that BOTH manual timing
-- and CV timing write to. Same table, same results, two input modes.
-- ═══════════════════════════════════════════════════════════════

-- Race finishes table
CREATE TABLE IF NOT EXISTS race_finishes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES race_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Core timing data
  place INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,              -- finish time in milliseconds from gun start
  raw_ms INTEGER,                        -- unrounded raw time (manual mode)
  bib TEXT,                              -- bib number (null until assigned)

  -- Source tracking — which system recorded this finish
  source TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'cv' | 'backup'
  
  -- CV-specific fields (null for manual entries)
  track_id INTEGER,                      -- YOLO tracker ID
  confidence REAL,                       -- detection confidence 0-1
  flagged BOOLEAN DEFAULT FALSE,         -- needs human review
  
  -- Form analysis (null for manual, populated by CV)
  form_score REAL,                       -- composite form score 0-100
  trunk_angle REAL,                      -- forward lean in degrees
  cadence INTEGER,                       -- steps per minute
  vertical_osc REAL,                     -- vertical oscillation in pixels
  stride_width REAL,                     -- stride width in pixels

  -- Metadata
  synced BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_finishes_event ON race_finishes(event_id);
CREATE INDEX IF NOT EXISTS idx_finishes_event_place ON race_finishes(event_id, place);
CREATE INDEX IF NOT EXISTS idx_finishes_source ON race_finishes(source);

-- Row Level Security
ALTER TABLE race_finishes ENABLE ROW LEVEL SECURITY;

-- Policy: users can read finishes for any event (results are public)
CREATE POLICY "Public read access" ON race_finishes
  FOR SELECT USING (true);

-- Policy: users can insert/update/delete their own finishes
CREATE POLICY "Users manage own finishes" ON race_finishes
  FOR ALL USING (auth.uid() = user_id);

-- Enable real-time subscriptions on this table
ALTER PUBLICATION supabase_realtime ADD TABLE race_finishes;
