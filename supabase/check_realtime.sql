-- Is board_matches actually being replicated to Realtime?
select
  c.relname as table_name,
  case when p.pubname is null
    then '❌ not published — realtime will never deliver a move'
    else '✅ published as ' || p.pubname
  end as realtime
from pg_class c
left join pg_publication_rel pr on pr.prrelid = c.oid
left join pg_publication p on p.oid = pr.prpubid
where c.relname in ('board_matches', 'board_chat', 'game_answers')
order by c.relname;
