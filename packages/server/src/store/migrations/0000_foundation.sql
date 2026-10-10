CREATE TABLE users (user_id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE conversations (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(user_id), title TEXT CHECK(title IS NULL OR length(title) BETWEEN 1 AND 200), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,id));
--> statement-breakpoint
CREATE TABLE messages (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(user_id), conversation_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant','system')), content TEXT NOT NULL CHECK(length(content)>0), safety_tier INTEGER CHECK(safety_tier IS NULL OR safety_tier BETWEEN 0 AND 2), model_id TEXT, created_at TEXT NOT NULL, UNIQUE(user_id,id), FOREIGN KEY(user_id,conversation_id) REFERENCES conversations(user_id,id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE diary_entries (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(user_id), origin TEXT NOT NULL CHECK(origin IN ('manual','excerpt','ai_draft','support_note')), title TEXT CHECK(title IS NULL OR length(title)<=200), content TEXT NOT NULL CHECK(length(content)>0), access_level TEXT NOT NULL DEFAULT 'private' CHECK(access_level IN ('private','ai_eligible')), include_in_handoff INTEGER NOT NULL CHECK(include_in_handoff IN (0,1)), tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json) AND json_type(tags_json)='array'), mood INTEGER CHECK(mood IS NULL OR mood BETWEEN 1 AND 5), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,id));
--> statement-breakpoint
CREATE TABLE memories (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(user_id), content TEXT NOT NULL CHECK(length(content)>0), origin TEXT NOT NULL CHECK(origin IN ('user','ai_proposal')), status TEXT NOT NULL CHECK(status IN ('proposed','approved','rejected')), access_level TEXT NOT NULL DEFAULT 'private' CHECK(access_level IN ('private','ai_eligible')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,id), CHECK(origin != 'user' OR status='approved'));
--> statement-breakpoint
CREATE TABLE devices (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(user_id), label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 100), platform TEXT NOT NULL CHECK(platform IN ('ios','android','web','desktop')), token_hash TEXT UNIQUE, created_at TEXT NOT NULL, last_seen_at TEXT, revoked_at TEXT);
--> statement-breakpoint
CREATE TABLE settings (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(user_id), use_memories_default INTEGER NOT NULL DEFAULT 1 CHECK(use_memories_default IN (0,1)), diary_default_access_level TEXT NOT NULL DEFAULT 'private' CHECK(diary_default_access_level IN ('private','ai_eligible')), updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE provenance (user_id TEXT NOT NULL REFERENCES users(user_id), derived_type TEXT NOT NULL CHECK(derived_type IN ('memory','diary_entry')), derived_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT, CHECK((source_type='manual' AND source_id IS NULL) OR (source_type IN ('message','diary_entry') AND source_id IS NOT NULL)));
--> statement-breakpoint
CREATE TABLE message_context (user_id TEXT NOT NULL REFERENCES users(user_id), message_id TEXT NOT NULL, source_type TEXT NOT NULL CHECK(source_type IN ('diary_entry','memory')), source_id TEXT NOT NULL, PRIMARY KEY(user_id,message_id,source_type,source_id), FOREIGN KEY(user_id,message_id) REFERENCES messages(user_id,id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE tombstones (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(user_id), entity_type TEXT NOT NULL CHECK(entity_type IN ('conversation','message','diary_entry','memory')), entity_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('user_deleted','access_revoked','expired')), deleted_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX conversations_user_updated ON conversations(user_id,updated_at);
--> statement-breakpoint
CREATE INDEX messages_user_conversation_created ON messages(user_id,conversation_id,created_at);
--> statement-breakpoint
CREATE INDEX diary_user_updated ON diary_entries(user_id,updated_at);
--> statement-breakpoint
CREATE INDEX diary_user_access ON diary_entries(user_id,access_level);
--> statement-breakpoint
CREATE INDEX memories_user_access_status ON memories(user_id,access_level,status);
--> statement-breakpoint
CREATE INDEX devices_user ON devices(user_id);
--> statement-breakpoint
CREATE INDEX provenance_user_source ON provenance(user_id,source_type,source_id);
--> statement-breakpoint
CREATE INDEX context_user_source ON message_context(user_id,source_type,source_id);
--> statement-breakpoint
CREATE INDEX tombstones_user_entity ON tombstones(user_id,entity_type,entity_id);
--> statement-breakpoint
CREATE UNIQUE INDEX provenance_link ON provenance(user_id,derived_type,derived_id,source_type,coalesce(source_id,''));
--> statement-breakpoint
CREATE TRIGGER provenance_check_insert BEFORE INSERT ON provenance BEGIN
 SELECT CASE WHEN
  (new.derived_type='memory' AND NOT EXISTS(SELECT 1 FROM memories WHERE user_id=new.user_id AND id=new.derived_id)) OR
  (new.derived_type='diary_entry' AND NOT EXISTS(SELECT 1 FROM diary_entries WHERE user_id=new.user_id AND id=new.derived_id)) OR
  (new.source_type='message' AND NOT EXISTS(SELECT 1 FROM messages WHERE user_id=new.user_id AND id=new.source_id)) OR
  (new.source_type='diary_entry' AND NOT EXISTS(SELECT 1 FROM diary_entries WHERE user_id=new.user_id AND id=new.source_id))
 THEN RAISE(ABORT,'Invalid provenance reference') END;
 END;
--> statement-breakpoint
CREATE TRIGGER context_check_insert BEFORE INSERT ON message_context BEGIN
 SELECT CASE WHEN
  (new.source_type='memory' AND NOT EXISTS(SELECT 1 FROM memories WHERE user_id=new.user_id AND id=new.source_id)) OR
  (new.source_type='diary_entry' AND NOT EXISTS(SELECT 1 FROM diary_entries WHERE user_id=new.user_id AND id=new.source_id))
 THEN RAISE(ABORT,'Invalid context reference') END;
 END;
--> statement-breakpoint
CREATE TRIGGER provenance_check_update BEFORE UPDATE ON provenance BEGIN
 SELECT CASE WHEN
  (new.derived_type='memory' AND NOT EXISTS(SELECT 1 FROM memories WHERE user_id=new.user_id AND id=new.derived_id)) OR
  (new.derived_type='diary_entry' AND NOT EXISTS(SELECT 1 FROM diary_entries WHERE user_id=new.user_id AND id=new.derived_id)) OR
  (new.source_type='message' AND NOT EXISTS(SELECT 1 FROM messages WHERE user_id=new.user_id AND id=new.source_id)) OR
  (new.source_type='diary_entry' AND NOT EXISTS(SELECT 1 FROM diary_entries WHERE user_id=new.user_id AND id=new.source_id))
 THEN RAISE(ABORT,'Invalid provenance reference') END;
 END;
--> statement-breakpoint
CREATE TRIGGER context_check_update BEFORE UPDATE ON message_context BEGIN
 SELECT CASE WHEN
  (new.source_type='memory' AND NOT EXISTS(SELECT 1 FROM memories WHERE user_id=new.user_id AND id=new.source_id)) OR
  (new.source_type='diary_entry' AND NOT EXISTS(SELECT 1 FROM diary_entries WHERE user_id=new.user_id AND id=new.source_id))
 THEN RAISE(ABORT,'Invalid context reference') END;
 END;
--> statement-breakpoint
-- Keep content-free source references after source deletion: an unresolved
-- source is private (D16), and D33 still needs its message_context IDs.
CREATE TRIGGER diary_entries_links_delete AFTER DELETE ON diary_entries BEGIN
 DELETE FROM provenance WHERE user_id=old.user_id AND derived_type='diary_entry' AND derived_id=old.id;
 END;
--> statement-breakpoint
CREATE TRIGGER memories_links_delete AFTER DELETE ON memories BEGIN
 DELETE FROM provenance WHERE user_id=old.user_id AND derived_type='memory' AND derived_id=old.id;
 END;
--> statement-breakpoint
CREATE VIRTUAL TABLE diary_fts USING fts5(user_id UNINDEXED, title, content, content='diary_entries', content_rowid='rowid');
--> statement-breakpoint
INSERT INTO diary_fts(diary_fts,rank) VALUES('secure-delete',1);
--> statement-breakpoint
CREATE TRIGGER diary_entries_fts_insert AFTER INSERT ON diary_entries BEGIN
 INSERT INTO diary_fts(rowid,user_id,title,content) VALUES(new.rowid,new.user_id,new.title,new.content); END;
--> statement-breakpoint
CREATE TRIGGER diary_entries_fts_delete AFTER DELETE ON diary_entries BEGIN
 INSERT INTO diary_fts(diary_fts,rowid,user_id,title,content) VALUES('delete',old.rowid,old.user_id,old.title,old.content); END;
--> statement-breakpoint
CREATE TRIGGER diary_entries_fts_update AFTER UPDATE ON diary_entries BEGIN
 INSERT INTO diary_fts(diary_fts,rowid,user_id,title,content) VALUES('delete',old.rowid,old.user_id,old.title,old.content);
 INSERT INTO diary_fts(rowid,user_id,title,content) VALUES(new.rowid,new.user_id,new.title,new.content); END;
--> statement-breakpoint
CREATE VIRTUAL TABLE memory_fts USING fts5(user_id UNINDEXED, content, content='memories', content_rowid='rowid');
--> statement-breakpoint
INSERT INTO memory_fts(memory_fts,rank) VALUES('secure-delete',1);
--> statement-breakpoint
CREATE TRIGGER memories_fts_insert AFTER INSERT ON memories BEGIN
 INSERT INTO memory_fts(rowid,user_id,content) VALUES(new.rowid,new.user_id,new.content); END;
--> statement-breakpoint
CREATE TRIGGER memories_fts_delete AFTER DELETE ON memories BEGIN
 INSERT INTO memory_fts(memory_fts,rowid,user_id,content) VALUES('delete',old.rowid,old.user_id,old.content); END;
--> statement-breakpoint
CREATE TRIGGER memories_fts_update AFTER UPDATE ON memories BEGIN
 INSERT INTO memory_fts(memory_fts,rowid,user_id,content) VALUES('delete',old.rowid,old.user_id,old.content);
 INSERT INTO memory_fts(rowid,user_id,content) VALUES(new.rowid,new.user_id,new.content); END;
