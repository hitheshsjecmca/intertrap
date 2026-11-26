# Module 6 frontend

The public landing, login and registration pages use the existing authentication components and styles. A single `AuthProvider` wraps the React Router data router. A pathless `ProtectedRoute` waits for session restoration and redirects unsigned visitors. Its `Outlet` renders `AppLayout`, whose own outlet renders the selected workspace page. The data router also supports the draft navigation guard in Module 7.

| Route | Page |
| --- | --- |
| `/dashboard` | Workspace overview and entry point for the interview form |
| `/interviews/new` | Interview form and preview |
| `/interviews` | History with a working link to the form |
| `/analytics` | Performance analytics empty state |
| `/weaknesses` | Weakness analysis empty state |
| `/ai-insights` | Planned analysis and recommendations |
| `/profile` | Auth identity and read-only profile query |
| `/settings` | Account details and session logout |

The workspace layout provides grouped `NavLink` items, a visible active destination, account name and email, working logout and a mobile menu with `aria-expanded`. The main region has a keyboard skip link. Shared headings, actions, empty states and status badges accept props. Menu and asynchronous request states belong to the components that own them.

Scoped workspace styles reuse the existing theme variables and define shared spacing, radius and shadows. CSS Grid adjusts card columns, and the visible menu becomes a toggle below 800px. Buttons and links receive visible keyboard focus, and controls use labelled text. The profile page retains identity details from Auth while it loads, or if the database query fails. It may display a missing profile message after backfill or configuration issues.

Dashboard metrics use an unavailable indicator and explanatory copy until interview data is connected. The UI has no fabricated rows, fake charts or readiness score. Presentation components render view data while Supabase calls and form rules live outside the presentational steps.

## Technical interview questions and answers


### 1. What is a component?

A component renders part of the UI from props and state. PageHeading accepts a title, description and optional action.

### 2. Why share AppLayout?

Navigation, account identity and logout are common to every protected page. A shared layout avoids separate copies.

### 3. What are nested routes?

They compose parent route elements with descendants. InterTrap groups workspace pages below the authentication check and shared layout.

### 4. What does Outlet render?

It renders the matching child route element. The layout's outlet also provides account context for its pages.

### 5. What is a pathless route?

It adds behavior or a layout without appending a path segment to its children's URLs.

### 6. Why use a data router?

It supports route blockers for unsaved form changes while continuing to render nested route elements.

### 7. What does NavLink add?

It identifies the active destination, exposes aria-current and can apply active styling.

### 8. Why use exact active matching?

It keeps Interview History from appearing active while the user is on the Add Interview subpath.

### 9. What are props?

Inputs passed from a parent component. Updating the inputs changes the rendered heading or badge.

### 10. What is local state?

It tracks UI values a component can change, such as whether mobile navigation is expanded.

### 11. Why preserve session loading?

A session can still be restoring on refresh. Waiting avoids sending an authenticated user through a spurious login redirect.

### 12. Why keep a single authentication provider?

Both guests and protected pages consume a consistent session and one Auth subscription.

### 13. What is responsive CSS?

Selectors and breakpoints adapt layout to available space. The dashboard changes from four metric columns to two and then one.

### 14. Why use CSS variables?

They centralize theme values and provide consistent colors, spacing and shapes across workspace components.

### 15. Why use minmax(0, 1fr) in grids?

It lets a column shrink below its content's default minimum width. This helps avoid overflow on a narrow viewport.

### 16. How does mobile navigation stay accessible?

A labelled button exposes expanded state and controls the navigation region. Keyboard focus remains visible.

### 17. What is a skip link?

It lets keyboard users move straight to main content without traversing the sidebar on every page.

### 18. How do empty states improve the dashboard?

They explain when metrics and history will become available and give users a working way to start a preview.

### 19. How does the profile handle failed queries?

It continues showing identity from the Auth session and explains if application profile details are missing or unavailable.

### 20. How do you separate presentation and business logic?

Keep reusable displays driven by props. Put catalog reads in a service and deterministic validation and progression in utilities.
