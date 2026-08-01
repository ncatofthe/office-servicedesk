# Task Manager Backend Audit & Fixes TODO

## Progress
- [x] 1. Update prisma/schema.prisma (add progress, POSTPONED enum, Transaction Type enum)
- [x] 2. Run prisma migrate dev --name audit_schema && prisma generate (used db push)
- [x] 3. Update src/services/task.service.js (POSTPONED transitions, auto-review on REVIEW)
- [x] 4. Update src/services/review.service.js (transaction EXPENSE, company account?)
- [x] 5. Fix src/services/dashboard.service.js (queries, role filters, type INCOME/EXPENSE)
- [x] 6. Fix src/services/reports.service.js (SQL fixes, date filters, joins)
- [x] 7. Update src/controllers/auth.controller.js (register role=ADMIN only)
- [x] 8. Fix prisma/seed.js (correct accountIds, transaction amounts)
- [x] 9. Align src/services/finance.service.js (type enum)
- [x] 10. Add missing route protections (finance/reports roleMiddleware)
- [x] 11. Add global error handler in src/server.js
- [x] 12. Fix finance.routes.js — add createAccount to imports
- [x] 13. Add GET /api/accounts/:userId route
- [x] 14. Add file routes: POST/GET /api/files/:taskId, DELETE /api/files/:id
- [x] 15. Add comment routes: GET/POST /api/comments/:taskId, PUT/DELETE /api/comments/:id
- [x] 16. Clean up task.routes.js (remove duplicate comment/attachment routes)
- [ ] 17. Add input validation middleware (express-validator / zod)
- [ ] 18. Add unit/integration tests
- [ ] 19. Run prisma db seed && test server

**Current step: 16/19**

