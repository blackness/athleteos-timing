"""
AthletOS Edge Timer → Supabase Sync
====================================
Pushes CV timing results to Supabase in real-time.

SETUP:
  pip install supabase

USAGE:
  from supabase_sync import SupabaseSync
  
  sync = SupabaseSync(event_id="your-event-uuid", user_id="your-user-uuid")
  
  # When a runner crosses the finish line:
  sync.push_finish(
      place=1,
      time_ms=962340,
      track_id=7,
      confidence=0.96,
      form_score=88.5,
      trunk_angle=6.2,
      cadence=174,
  )
"""

import os
import json
from datetime import datetime

# ── Try importing supabase; provide clear error if missing ──
try:
    from supabase import create_client, Client
except ImportError:
    print("\n[ERROR] supabase-py not installed.")
    print("Run:  pip install supabase\n")
    exit(1)


# ═══════════════════════════════════════════════════════════════
# CONFIG — Update these with your Supabase credentials
# ═══════════════════════════════════════════════════════════════

SUPABASE_URL = os.environ.get(
    'SUPABASE_URL',
    'https://sclhzmgdafotyiynrjwr.supabase.co'  # your project URL
)
SUPABASE_KEY = os.environ.get(
    'SUPABASE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjbGh6bWdkYWZvdHlpeW5yandyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDIyMzMsImV4cCI6MjA4NjcxODIzM30.lNrQF2Bpe7f2dno0rZ9XzqGSzyFi3vwKkLny8VPnBH8'
)


class SupabaseSync:
    """Syncs CV timing results to Supabase in real-time."""

    def __init__(self, event_id: str, user_id: str):
        self.event_id = event_id
        self.user_id = user_id
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self._offline_queue = []
        print(f"[Sync] Connected to Supabase for event {event_id[:8]}...")

    def push_finish(
        self,
        place: int,
        time_ms: int,
        track_id: int = None,
        confidence: float = None,
        flagged: bool = False,
        bib: str = None,
        form_score: float = None,
        trunk_angle: float = None,
        cadence: int = None,
        vertical_osc: float = None,
        stride_width: float = None,
    ):
        """Push a single finish result to Supabase."""
        record = {
            'event_id': self.event_id,
            'user_id': self.user_id,
            'place': place,
            'time_ms': time_ms,
            'source': 'cv',
            'track_id': track_id,
            'confidence': confidence,
            'flagged': flagged,
            'bib': bib,
            'form_score': form_score,
            'trunk_angle': trunk_angle,
            'cadence': cadence,
            'vertical_osc': vertical_osc,
            'stride_width': stride_width,
        }

        # Remove None values so Supabase uses defaults
        record = {k: v for k, v in record.items() if v is not None}

        try:
            result = self.client.table('race_finishes').insert(record).execute()
            print(f"[Sync] ✓ Place #{place} synced (track_id={track_id})")
            return result.data
        except Exception as e:
            print(f"[Sync] ✗ Failed to sync place #{place}: {e}")
            # Queue for retry
            self._offline_queue.append(record)
            return None

    def flush_queue(self):
        """Retry any queued results that failed to sync."""
        if not self._offline_queue:
            return

        print(f"[Sync] Retrying {len(self._offline_queue)} queued results...")
        remaining = []
        for record in self._offline_queue:
            try:
                self.client.table('race_finishes').insert(record).execute()
                print(f"[Sync] ✓ Retry succeeded for place #{record['place']}")
            except Exception as e:
                print(f"[Sync] ✗ Retry failed for place #{record['place']}: {e}")
                remaining.append(record)

        self._offline_queue = remaining

    def get_results(self):
        """Fetch all results for this event."""
        try:
            result = (
                self.client.table('race_finishes')
                .select('*')
                .eq('event_id', self.event_id)
                .order('place')
                .execute()
            )
            return result.data
        except Exception as e:
            print(f"[Sync] Failed to fetch results: {e}")
            return []


# ═══════════════════════════════════════════════════════════════
# EXAMPLE USAGE — how to integrate with athletos_timer.py
# ═══════════════════════════════════════════════════════════════

EXAMPLE = """
# In athletos_timer.py, after a runner crosses the finish line:

from supabase_sync import SupabaseSync

# Initialize once at start (get event_id from the dashboard URL)
sync = SupabaseSync(
    event_id="your-event-uuid-from-dashboard",
    user_id="your-user-uuid-from-auth"
)

# Inside the finish detection loop:
if runner_crossed_finish_line:
    sync.push_finish(
        place=len(finish_results) + 1,
        time_ms=int(elapsed_seconds * 1000),
        track_id=track_id,
        confidence=detection_confidence,
        flagged=(detection_confidence < 0.90),
        form_score=form_metrics.get('form_score'),
        trunk_angle=form_metrics.get('trunk_angle'),
        cadence=form_metrics.get('cadence'),
    )

# At the end of the race, retry any failed syncs:
sync.flush_queue()
"""

if __name__ == '__main__':
    print("AthletOS Supabase Sync Module")
    print("=" * 40)
    print(EXAMPLE)
