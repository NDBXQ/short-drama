import { sql } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcAgentSteps, tvcChatMessages, tvcJobs, tvcStories, tvcStoryOutlines, tvcStoryboards } from "@/shared/schema"

const ENSURE_VERSION = 2

export async function ensureTvcSchema(): Promise<void> {
  const g = globalThis as any
  if (g.__tvcSchemaEnsuredVersion === ENSURE_VERSION) return
  const db = await getDb({ tvcStories, tvcStoryOutlines, tvcStoryboards, tvcAgentSteps, tvcChatMessages, tvcJobs })

  await db.execute(sql`create schema if not exists tvc;`)

  await db.execute(sql`
    do $$
    declare k text;
    begin
      select c.relkind::text into k
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'tvc' and c.relname = 'stories'
      limit 1;
      if k = 'v' then execute 'drop view tvc.stories cascade'; end if;
      if k = 'm' then execute 'drop materialized view tvc.stories cascade'; end if;
      k := null;

      select c.relkind::text into k
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'tvc' and c.relname = 'story_outlines'
      limit 1;
      if k = 'v' then execute 'drop view tvc.story_outlines cascade'; end if;
      if k = 'm' then execute 'drop materialized view tvc.story_outlines cascade'; end if;
      k := null;

      select c.relkind::text into k
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'tvc' and c.relname = 'storyboards'
      limit 1;
      if k = 'v' then execute 'drop view tvc.storyboards cascade'; end if;
      if k = 'm' then execute 'drop materialized view tvc.storyboards cascade'; end if;
      k := null;

      select c.relkind::text into k
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'tvc' and c.relname = 'jobs'
      limit 1;
      if k = 'v' then execute 'drop view tvc.jobs cascade'; end if;
      if k = 'm' then execute 'drop materialized view tvc.jobs cascade'; end if;
      k := null;

      select c.relkind::text into k
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'tvc' and c.relname = 'generated_images'
      limit 1;
      if k = 'v' then execute 'drop view tvc.generated_images cascade'; end if;
      if k = 'm' then execute 'drop materialized view tvc.generated_images cascade'; end if;
      k := null;

      select c.relkind::text into k
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'tvc' and c.relname = 'generated_audios'
      limit 1;
      if k = 'v' then execute 'drop view tvc.generated_audios cascade'; end if;
      if k = 'm' then execute 'drop materialized view tvc.generated_audios cascade'; end if;
    end $$;
  `)

  await db.execute(sql`
    create table if not exists tvc.stories (
      id text primary key default gen_random_uuid(),
      user_id text not null,
      title text,
      story_type text,
      resolution text not null,
      aspect_ratio text not null default '16:9',
      style text not null default 'cinema',
      story_text text not null,
      generated_text text,
      final_video_url text,
      status text not null default 'draft',
      progress_stage text not null default 'outline',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz
    );
  `)

  await db.execute(sql`
    create table if not exists tvc.story_outlines (
      id text primary key default gen_random_uuid(),
      story_id text not null references tvc.stories(id) on delete cascade,
      sequence integer not null,
      outline_text text not null,
      original_text text not null,
      outline_drafts jsonb not null default '[]'::jsonb,
      active_outline_draft_id text,
      created_at timestamptz not null default now()
    );
  `)

  await db.execute(sql`
    create table if not exists tvc.storyboards (
      id text primary key default gen_random_uuid(),
      outline_id text not null,
      sequence integer not null,
      scene_title text not null,
      original_text text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz,
      is_reference_generated boolean not null default false,
      shot_cut boolean not null default false,
      storyboard_text text not null default '',
      is_video_generated boolean not null default false,
      is_script_generated boolean not null default false,
      script_content jsonb,
      frames jsonb not null default '{}'::jsonb,
      video_info jsonb not null default '{}'::jsonb
    );
  `)

  await db.execute(sql`
    create table if not exists tvc.agent_steps (
      id text primary key default gen_random_uuid(),
      story_id text not null references tvc.stories(id) on delete cascade,
      step_id text not null,
      title text,
      raw_xml text not null,
      content jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
  `)

  await db.execute(sql`
    create table if not exists tvc.chat_messages (
      id text primary key default gen_random_uuid(),
      story_id text not null references tvc.stories(id) on delete cascade,
      role text not null,
      content text not null,
      created_at timestamptz not null default now()
    );
  `)

  await db.execute(sql`
    create table if not exists tvc.jobs (
      id text primary key default gen_random_uuid(),
      user_id text not null,
      type text not null,
      status text not null,
      story_id text references tvc.stories(id) on delete cascade,
      storyboard_id text references tvc.storyboards(id) on delete set null,
      payload jsonb not null,
      snapshot jsonb not null,
      progress_version integer not null default 0,
      started_at timestamptz,
      finished_at timestamptz,
      error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `)

  await db.execute(sql`create index if not exists tvc_story_outlines_story_id_idx on tvc.story_outlines(story_id);`)
  await db.execute(sql`create unique index if not exists tvc_agent_steps_story_id_step_id_uq on tvc.agent_steps(story_id, step_id);`)
  await db.execute(sql`create index if not exists tvc_chat_messages_story_id_created_at_idx on tvc.chat_messages(story_id, created_at);`)

  g.__tvcSchemaEnsuredVersion = ENSURE_VERSION
}
