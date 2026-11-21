-- The launch gate no longer limits the founder cohort to the launch founder.
create or replace function ops.member_launch_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s ops.member_launch_settings; widens boolean;
begin
  if new.status <> 'active' then return new; end if;
  widens := tg_op = 'INSERT' or old.status <> 'active' or old.user_id is distinct from new.user_id
    or old.cohort is distinct from new.cohort or (old.expires_at is not null and (new.expires_at is null or new.expires_at > old.expires_at));
  if not widens then return new; end if;
  select * into s from ops.member_launch_settings where id;
  if not s.external_access_approved and (s.founder_user_id is null or new.user_id <> s.founder_user_id) then
    raise exception 'closed';
  end if;
  return new;
end; $$;
