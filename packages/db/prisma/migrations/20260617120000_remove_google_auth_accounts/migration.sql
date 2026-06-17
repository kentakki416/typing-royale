-- Google OAuth ログインを廃止したため、provider='google' の auth_accounts 行を削除する。
-- リンクされていた users 行は他の auth_accounts (github / dev) が紐づいていれば残り、
-- そうでなければ親 user は孤立するが本アプリでは未リリースのため許容する。
DELETE FROM auth_accounts WHERE provider = 'google';
