ALTER FUNCTION public.handle_new_user() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
