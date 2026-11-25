# CYI Radio – Architecture and Hosting-Specific Requirements Addendum

## 1. Confirmed Project Configuration

The following decisions are final and should guide implementation:

- Hosting provider: Namecheap.
- Hosting plan: Stellar Plus.
- Application domain: https://live.cyiradio.com.
- Existing Icecast server: https://radio.cyiradio.com.
- Public Icecast mountpoint: /live.
- Public stream URL: https://radio.cyiradio.com/live.
- Icecast status endpoint: https://radio.cyiradio.com/status.xsl.
- Frontend: React + Vite.
- Backend: Node.js + Express.js.
- Database: PostgreSQL.
- ORM: Drizzle ORM.
- Chat: Public, no registration required.
- Administrators: More than five.
- Schedule types: One-time and recurring programmes.
- Station timezone: Africa/Accra.

Do not replace the existing Icecast infrastructure or introduce another streaming server.

## 2. Refined Application Architecture

Implement a single-application architecture.

The Express application must:

- Serve the production React frontend.
- Expose REST API endpoints under /api/v1.
- Handle administrator authentication.
- Manage PostgreSQL operations.
- Handle real-time chat if the hosting environment supports it.
- Provide server-side schedule calculations.

The frontend and backend should be maintained in one GitHub repository.

Avoid unnecessary microservices, containers, Redis, separate frontend hosting or VPS-only infrastructure.

## 3. Hosting Compatibility Validation

Before building the complete application, create a proof-of-concept project and validate the following on the actual Namecheap Stellar Plus hosting account.

### Node.js
- Confirm Node.js 22 availability.
- Confirm that the required Node.js packages install successfully.
- Confirm that Express starts using cPanel Setup Node.js App.
- Confirm the application can be restarted through cPanel.
- Confirm that the application can serve both React assets and API requests.

### PostgreSQL
- Confirm PostgreSQL availability.
- Retrieve and document the actual PostgreSQL version.
- Test remote/local application connectivity as appropriate for the hosting environment.
- Verify database permissions.
- Verify Drizzle ORM compatibility with the installed PostgreSQL version.
- Test migrations against the actual database version.

Namecheap currently documents PostgreSQL 10.23 on shared hosting. If this is the version available, use a compatible schema and SQL feature set. Investigate whether a newer version can be provided.

### Real-time chat
- Test WebSocket connections through Socket.IO.
- Test multiple simultaneous connections.
- Test connection persistence.
- Test reconnect behaviour.
- Test message delivery.
- Test whether polling fallback works.
- Verify that shared hosting resource restrictions do not interrupt the service.

Do not assume that WebSocket support is guaranteed simply because Node.js is available.

If reliable persistent connections cannot be maintained, evaluate a managed real-time messaging service. Keep chat persistence in PostgreSQL.

Produce a compatibility report before proceeding with the full implementation.

## 4. Administrator Management and Permissions

The application must support more than five administrators.

Implement Role-Based Access Control.

Initial roles:

1. Super Admin.
2. Administrator.
3. Schedule Manager.
4. Content Manager.
5. Chat Moderator.

Implement permissions separately from roles so that additional roles and custom permission assignments can be introduced later.

Requirements:

- Super Admin can create administrator accounts.
- Super Admin can assign and revoke roles.
- Administrators can be deactivated.
- Administrators cannot access features outside their assigned permissions.
- All permissions must be checked on the backend.
- Frontend route protection must not be treated as the only security mechanism.
- Administrators must authenticate using individual accounts.
- Use secure password hashing.
- Provide password reset functionality through a secure mechanism.
- Implement login rate limiting.

Do not provide public administrator registration.

Create an initial Super Admin through a secure one-time CLI setup or seed process. Never hardcode production credentials.

### Administrative audit logs

Introduce an admin_activity_logs table.

Record:

- Administrator ID.
- Action.
- Affected resource.
- Resource ID.
- Timestamp.
- Relevant change metadata.

Record programme, schedule, presenter, moderation and station-setting changes.

## 5. Refined Scheduling Architecture

Support both individual and recurring programmes.

### One-time programmes

Administrators should be able to create a programme occurrence with:

- Programme.
- Presenter.
- Date.
- Start time.
- End time.
- Publication status.

### Recurring programmes

Support recurring schedules such as:

- Every Monday.
- Every weekday.
- Every Saturday.
- Selected days of the week.

Use a schedule series with recurrence rules rather than generating unlimited permanent schedule records.

### Schedule exceptions

Support:

- Cancelling an individual occurrence.
- Rescheduling an occurrence.
- Changing the presenter for a particular occurrence.
- Modifying the programme duration for a particular occurrence.

An exception must not unintentionally change the entire recurring series.

### Scheduling rules

- Use Africa/Accra as the station timezone.
- Handle timezone conversion consistently.
- Handle programmes that cross midnight.
- Prevent conflicting published programmes.
- Allow authorized administrators to override conflicts when necessary, with an audit record.
- Handle empty periods between scheduled programmes.
- Calculate the current and upcoming programmes server-side.

Use the effective schedule occurrence as the source of truth for the public listener interface.

Do not manually store or update a LIVE flag for each programme.

The currently live programme should be calculated using the current station-local time and published schedule occurrences.

The application must distinguish between a scheduled live programme and actual Icecast stream availability.

## 6. Refined Public Chat Requirements

Public visitors should be able to join using a display name without registering.

Implement:

- Unique internal chat session identifiers.
- Display name validation.
- Message validation.
- Message length limits.
- Rate limiting per session and connection.
- Basic spam protection.
- Message persistence in PostgreSQL.
- Paginated chat history.
- Reconnection support.
- Admin message deletion.
- Temporary and permanent session muting.
- Configurable message retention.

Do not rely exclusively on display names for moderation because names are not unique or verified.

Store only the information needed for chat functionality.

Render messages safely and prevent XSS.

Do not expose administrator moderation operations to public clients.

## 7. Refined Database Schema

Use PostgreSQL and Drizzle ORM.

In addition to the original entities, implement the following:

### admins
Individual administrator accounts.

### roles
Available administrator roles.

### permissions
Individual application permissions.

### admin_roles
Many-to-many administrator and role assignments.

### role_permissions
Many-to-many role and permission assignments.

### presenters
Presenter profiles.

### programmes
Radio programme information.

### schedule_series
One-time and recurring schedule definitions.

### schedule_exceptions
Changes and cancellations affecting individual occurrences.

### chat_sessions
Internal identifiers and moderation state for anonymous chat participants.

### chat_messages
Persisted public chat messages.

### muted_users
Temporary or permanent chat restrictions.

### station_settings
Public station configuration.

### admin_activity_logs
Administrative audit trail.

Use appropriate foreign keys, indexes and database constraints.

Prefer stable identifiers and consistent created_at and updated_at fields.

Use soft deletion or archival where historical references need to be retained.

Do not run schema synchronization automatically on application startup.

## 8. Refined GitHub and cPanel Deployment

The repository must be deployable through Namecheap cPanel Git Version Control.

Recommended deployment configuration:

- Repository hosted on GitHub.
- Repository cloned into a private application directory.
- Node.js application managed through Setup Node.js App.
- Application URL configured as live.cyiradio.com.
- React production assets served through Express.
- PostgreSQL credentials configured through cPanel environment variables.

Create a .cpanel.yml deployment configuration appropriate for the final repository layout.

The deployment process must:

1. Pull the latest commit from GitHub.
2. Validate the production dependencies.
3. Build the React application.
4. Deploy application assets without exposing private source files.
5. Preserve environment variables.
6. Preserve uploaded media.
7. Avoid overwriting production configuration.
8. Avoid modifying the database automatically unless an explicitly approved migration step is being performed.
9. Provide clear instructions for restarting the Node.js application.

Use a manual deployment process through cPanel initially.

Do not assume that Git deployment automatically restarts the Node.js application.

### Database migrations

Use Drizzle Kit to generate and version-control SQL migration files.

Provide the following commands:

- Generate migration.
- Inspect migration.
- Run migration.
- Check migration status.
- Back up database.
- Restore database.

Migrations must be executed deliberately.

Before production migrations:

1. Back up the PostgreSQL database.
2. Inspect the generated SQL.
3. Confirm compatibility with the production PostgreSQL version.
4. Execute the migration.
5. Verify the resulting database schema.
6. Restart the application if necessary.

Never run destructive migrations automatically during application startup.

## 9. Production Configuration

Use cPanel environment variables for production configuration.

Required variables:

- NODE_ENV
- PORT
- DATABASE_URL
- SESSION_SECRET
- ICECAST_STREAM_URL
- ICECAST_STATUS_URL
- PUBLIC_APP_URL
- STATION_TIMEZONE

Use the following initial values where appropriate:

PUBLIC_APP_URL=https://live.cyiradio.com

ICECAST_STREAM_URL=https://radio.cyiradio.com/live

ICECAST_STATUS_URL=https://radio.cyiradio.com/status.xsl

STATION_TIMEZONE=Africa/Accra

Do not commit production credentials.

Do not expose database connection information or private Icecast administration credentials to the frontend.

The public stream URL is not a secret. The Icecast source password and administrator credentials must remain private.

## 10. Additional Production Requirements

Implement:

- Secure HTTPS configuration.
- Secure session cookies.
- Appropriate security headers.
- Backend authorization.
- Input validation.
- Error logging.
- Database connection handling.
- Chat pagination.
- Image upload validation.
- Database backup instructions.
- Graceful error handling.
- Production health-check endpoint.
- Application startup and restart documentation.

Account for Stellar Plus shared-hosting resource limits.

Avoid unnecessary background workers and resource-intensive scheduled processes.

## 11. Revised Implementation Sequence

### Phase 0 – Hosting Proof of Concept
Validate Node.js, PostgreSQL, Drizzle migrations, cPanel deployment and real-time connections.

### Phase 1 – Project Foundation
Create repository, React frontend, Express backend, database configuration and initial migrations.

### Phase 2 – Radio Player
Integrate the existing Icecast stream and implement player controls and stream status.

### Phase 3 – Programme and Scheduling System
Build programme CRUD, presenters, one-time schedules, recurring schedules and schedule exceptions.

### Phase 4 – Public Listener Experience
Build the schedule interface, currently playing section and upcoming programme listings.

### Phase 5 – Public Chat
Implement anonymous chat sessions, message persistence, real-time delivery and moderation.

### Phase 6 – Administration
Implement administrator accounts, RBAC, dashboard, audit logs and management interfaces.

### Phase 7 – Production Deployment
Configure cPanel, GitHub, production migrations, HTTPS, application restart and testing.

## 12. Final Development Instructions

The project must prioritize compatibility with Namecheap Stellar Plus.

Do not proceed with a feature that depends on unverified hosting capabilities.

Start with the hosting proof of concept.

Present the architecture, database ERD, repository structure, compatibility report and implementation plan for approval.

After approval, implement one phase at a time.

At every phase, provide:

- Files created or modified.
- Features implemented.
- Database changes.
- Tests performed.
- Outstanding issues.
- Instructions for verifying the phase.

The completed application must be fully functional, not merely a visual prototype.