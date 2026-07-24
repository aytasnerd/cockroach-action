-- Seed the starting demand list into Supabase.
--
-- Run this ONCE, after schema.sql, in the Supabase SQL editor.
--
-- The existing counts go into offline_votes, not vote_count. offline_votes is
-- the tally an organizer carries over from paper or from a previous round;
-- vote_count is only ever touched by the trigger on real votes. Keeping them
-- in separate columns means a live vote adds to the carried-over number
-- instead of being overwritten by the next snapshot.
--
-- Safe to re-run: demands are matched on (chapter_id, slug).

insert into demands (chapter_id, slug, title, body, status, offline_votes)
select c.id, v.slug, v.title, v.body, 'accepted', v.offline_votes
from chapters c
cross join (values
  ('independent-probe-into-the-exam-leak', 'Independent probe into the exam leak', 'An independent, time-bound investigation (not run by the same agency implicated) into how the exam paper was leaked, with findings made public.', 128),
  ('structural-reform-of-the-testing-agency', 'Structural reform of the testing agency', 'A public audit of the exam-conducting body''s security, vendor contracts, and IT systems, with a published corrective action plan and independent oversight going forward.', 104),
  ('fair-re-exam-for-affected-candidates', 'Fair re-exam for affected candidates', 'A re-test on a fixed near-term date for every candidate whose exam was compromised, with travel and fee costs covered by the conducting body, not the students.', 97),
  ('accountability-at-the-top', 'Accountability at the top', 'Named accountability for the officials and ministers responsible for oversight failures, decided through due process rather than announcement.', 85),
  ('right-to-information-disclosure', 'Right to Information disclosure', 'Suo motu publication of the leak investigation''s terms of reference, timeline, and interim findings under the Right to Information Act, without requiring individual RTI requests.', 76),
  ('protection-for-whistleblowers-and-students', 'Protection for whistleblowers and students', 'No disciplinary, academic, or legal action against students or staff who came forward with evidence of the leak or joined peaceful protests about it.', 69),
  ('tamper-proof-exam-process-going-forward', 'Tamper-proof exam process going forward', 'End-to-end digital chain of custody for question papers, with independent audit logs, before the next exam cycle.', 54)
) as v(slug, title, body, offline_votes)
where c.slug = 'default'
on conflict (chapter_id, slug) do update
  set title = excluded.title,
      body = excluded.body,
      status = excluded.status,
      offline_votes = excluded.offline_votes;

select title, status, offline_votes, vote_count from demands order by offline_votes desc;
