# Test plan - tenant memberships

1. Superadmin selects tenant 4BID.
2. `GET /api/admin/users` must include every membership in 4BID, including identities whose legacy `admin_users.property_id` points to another tenant.
3. `GET /api/telephony/extensions` must return the same tenant roster.
4. Removing a secondary membership must not delete the shared Auth/admin identity.
5. `/super-admin/collaborators` must use the same 4BID membership roster.
6. Phone settings must always expose the persistent link to `/admin/channels/phone/audio` while scrolling.
