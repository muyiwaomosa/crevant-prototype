-- Members could open photo posting to everyone themselves.
grant execute on function ops.set_photo_audience(text, text, text) to authenticated;
