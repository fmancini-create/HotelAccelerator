-- Admin Users Table
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('super_admin', 'admin', 'editor')),
  can_upload BOOLEAN DEFAULT true,
  can_delete BOOLEAN DEFAULT false,
  can_move BOOLEAN DEFAULT true,
  can_manage_users BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photo Categories Table
CREATE TABLE IF NOT EXISTS public.photo_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  path TEXT NOT NULL,
  pages TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos Table (to track uploaded photos)
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  category_id UUID REFERENCES public.photo_categories(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_users
CREATE POLICY "Admin users can view all admin users" 
  ON public.admin_users FOR SELECT 
  USING (auth.uid() IN (SELECT id FROM public.admin_users));

CREATE POLICY "Super admins can insert admin users" 
  ON public.admin_users FOR INSERT 
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE role = 'super_admin')
  );

CREATE POLICY "Super admins can update admin users" 
  ON public.admin_users FOR UPDATE 
  USING (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE role = 'super_admin')
    OR auth.uid() = id
  );

CREATE POLICY "Super admins can delete admin users" 
  ON public.admin_users FOR DELETE 
  USING (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE role = 'super_admin')
  );

-- RLS Policies for photo_categories
CREATE POLICY "Admin users can view categories" 
  ON public.photo_categories FOR SELECT 
  USING (auth.uid() IN (SELECT id FROM public.admin_users));

CREATE POLICY "Admin users with permissions can insert categories" 
  ON public.photo_categories FOR INSERT 
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE can_upload = true)
  );

CREATE POLICY "Admin users with permissions can update categories" 
  ON public.photo_categories FOR UPDATE 
  USING (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE can_move = true OR role = 'super_admin')
  );

CREATE POLICY "Super admins can delete categories" 
  ON public.photo_categories FOR DELETE 
  USING (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE role = 'super_admin')
  );

-- RLS Policies for photos
CREATE POLICY "Admin users can view photos" 
  ON public.photos FOR SELECT 
  USING (auth.uid() IN (SELECT id FROM public.admin_users));

CREATE POLICY "Admin users with upload permission can insert photos" 
  ON public.photos FOR INSERT 
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE can_upload = true)
  );

CREATE POLICY "Admin users with move permission can update photos" 
  ON public.photos FOR UPDATE 
  USING (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE can_move = true)
  );

CREATE POLICY "Admin users with delete permission can delete photos" 
  ON public.photos FOR DELETE 
  USING (
    auth.uid() IN (SELECT id FROM public.admin_users WHERE can_delete = true)
  );
