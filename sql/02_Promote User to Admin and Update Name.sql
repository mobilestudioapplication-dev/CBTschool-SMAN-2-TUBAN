UPDATE auth.users 
SET raw_user_meta_data = '{"is_admin": true, "full_name": "Administrator Utama"}' 
WHERE email = 'admin@cbtschool.com';
