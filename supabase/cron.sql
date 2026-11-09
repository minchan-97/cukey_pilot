-- 아침 7시(KST = 22:00 UTC) '오늘의 약한 개념' 알림. 비서와 같은 pg_cron 방식.
-- Database → Extensions에서 pg_cron, pg_net 켠 뒤 실행. <...> 두 군데 채우기.
select cron.schedule(
  'imyong-d-morning',
  '0 22 * * *',
  $$
  select net.http_get(
    url := 'https://<배포주소>.vercel.app/api/cron/digest',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
  $$
);
