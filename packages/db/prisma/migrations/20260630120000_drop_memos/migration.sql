-- project-template 由来のサンプル機能だった memo API を撤去したため memos テーブルを drop する。
-- アプリケーションのどの機能からも参照されておらず、他テーブルとのリレーションも無い。
DROP TABLE IF EXISTS "memos";
