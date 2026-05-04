# Coding Platform Backend

Production-ready REST API for a multi-tenant coding platform with college-scoped leaderboards, Judge0 code execution, and JWT-based auth.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Cache / Leaderboard | Redis (ioredis) + Sorted Sets |
| Auth | JWT (access + refresh tokens) |
| Validation | Joi |
| Code Execution | Judge0 CE via RapidAPI |
| Logging | Winston |

---

## Folder Structure

```
backend/
├── server.js                  # Entry point
├── package.json
├── .env.example
│
├── config/
│   ├── db.js                  # MongoDB connection
│   ├── redis.js               # Redis connection (ioredis)
│   ├── logger.js              # Winston logger
│   └── judge0.js              # Language IDs, status codes
│
├── models/
│   ├── College.js             # College schema
│   ├── User.js                # Admin + Student schema
│   ├── Problem.js             # Problem + test cases schema
│   └── Submission.js          # Submission record schema
│
├── services/
│   ├── auth.service.js        # JWT generate/verify
│   ├── judge0.service.js      # Judge0 API, polling, batch execution
│   └── leaderboard.service.js # Redis sorted sets, score calc, rebuild
│
├── controllers/
│   ├── auth.controller.js
│   ├── college.controller.js
│   ├── student.controller.js
│   ├── problem.controller.js
│   ├── execution.controller.js
│   ├── submission.controller.js
│   └── leaderboard.controller.js
│
├── routes/
│   ├── auth.routes.js
│   ├── college.routes.js
│   ├── student.routes.js
│   ├── problem.routes.js
│   ├── execution.routes.js
│   ├── submission.routes.js
│   └── leaderboard.routes.js
│
├── middlewares/
│   ├── auth.middleware.js     # JWT verify + role guard
│   ├── rateLimiter.js         # Submission rate limiting
│   ├── errorHandler.js        # Global error handler
│   └── validate.js            # Joi validation middleware
│
└── utils/
    ├── AppError.js            # Operational error class
    ├── asyncHandler.js        # Async try/catch wrapper
    ├── response.js            # Standardized JSON responses
    ├── validators.js          # All Joi schemas
    └── seed.js                # DB seeder script
```

---

## Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)
- Redis (local or Redis Cloud)
- Judge0 RapidAPI key — get one free at https://rapidapi.com/judge0-official/api/judge0-ce

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd backend
npm install
```

### 2. Configure environment 

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=5000
NODE_ENV=development

MONGO_URI=mongodb://localhost:27017/coding_platform

JWT_SECRET=change_this_to_a_long_random_string
JWT_REFRESH_SECRET=change_this_to_another_long_random_string
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

REDIS_URL=redis://localhost:6379

JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your_rapidapi_key_here
JUDGE0_HOST=judge0-ce.p.rapidapi.com

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_SUBMISSIONS=5
```

### 3. Seed the database

```bash
npm run seed
```

This creates:
- Admin: `admin@platform.com` / `Admin@123`
- 2 colleges (IITM, NITT)
- 4 students (2 per college)
- 3 sample problems (Two Sum, Valid Parentheses, Maximum Subarray)

### 4. Start the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs at `http://localhost:5000`

Health check: `GET http://localhost:5000/health`

---

## API Reference

### Authentication

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login (admin or student) |
| POST | `/api/auth/refresh` | Public | Refresh access token |
| POST | `/api/auth/logout` | Auth | Invalidate refresh token |
| GET | `/api/auth/me` | Auth | Get current user profile |

**Login request:**
```json
POST /api/auth/login
{
  "email": "admin@platform.com",
  "password": "Admin@123"
}
```

**Login response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { "id": "...", "name": "...", "role": "admin" }
  }
}
```

All protected routes require:
```
Authorization: Bearer <accessToken>
```

---

### Colleges

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/colleges` | Admin | Create college |
| GET | `/api/colleges` | All | List colleges |
| GET | `/api/colleges/:id` | All | Get college |
| PUT | `/api/colleges/:id` | Admin | Update college |
| DELETE | `/api/colleges/:id` | Admin | Deactivate college |
| GET | `/api/colleges/:id/students` | Admin | Students in a college |

---

### Students

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/students` | Admin | Create student |
| GET | `/api/students` | Admin | List students |
| GET | `/api/students/:id` | Admin / Self | Get student profile |
| PUT | `/api/students/:id` | Admin | Update student |
| DELETE | `/api/students/:id` | Admin | Deactivate student |

**Create student:**
```json
POST /api/students
{
  "name": "Rahul Singh",
  "email": "rahul@iitm.ac.in",
  "password": "Pass@123",
  "collegeId": "<college_object_id>"
}
```

---

### Problems

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/problems` | Admin | Create problem |
| GET | `/api/problems` | All | List problems |
| GET | `/api/problems/:id` | All | Get problem (no hidden TCs) |
| GET | `/api/problems/:id/admin` | Admin | Get problem with hidden TCs |
| PUT | `/api/problems/:id` | Admin | Update problem |
| DELETE | `/api/problems/:id` | Admin | Delete problem |

**Create problem (abbreviated):**
```json
POST /api/problems
{
  "title": "Two Sum",
  "difficulty": "Easy",
  "tags": ["array", "hash-table"],
  "description": "Given an array...",
  "constraints": "2 <= nums.length <= 10^4",
  "examples": [{ "input": "nums=[2,7,11,15], target=9", "output": "[0,1]" }],
  "testCases": {
    "sample": [{ "input": "[2,7,11,15]\n9", "expectedOutput": "[0,1]" }],
    "hidden": [{ "input": "[3,3]\n6", "expectedOutput": "[0,1]" }]
  },
  "starterCode": { "javascript": "var twoSum = function(nums, target) {};" },
  "timeLimit": 2000,
  "memoryLimit": 256
}
```

---

### Code Execution

| Method | Endpoint | Access | Rate Limited | Description |
|---|---|---|---|---|
| POST | `/api/execute` | All auth | 5/min | Run against sample test cases |
| POST | `/api/submit` | All auth | 5/min | Run against hidden TCs + record submission |

**Execute (test run):**
```json
POST /api/execute
{
  "problemId": "<problem_id>",
  "language": "javascript",
  "code": "var twoSum = function(nums, target) { ... };"
}
```

**Execute response:**
```json
{
  "data": {
    "overallStatus": "Accepted",
    "allPassed": true,
    "passedCount": 2,
    "totalTestCases": 2,
    "avgRuntime": 42,
    "results": [...]
  }
}
```

**Submit (judge against hidden test cases):**
```json
POST /api/submit
{
  "problemId": "<problem_id>",
  "language": "python",
  "code": "class Solution:\n    def twoSum(self, nums, target): ..."
}
```

Supported languages: `javascript`, `python`, `java`, `cpp`, `c`, `typescript`, `go`, `rust`, `ruby`, `csharp`

---

### Submissions

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/submissions` | All | Admin: all; Student: own |
| GET | `/api/submissions/stats` | Admin | Acceptance stats |
| GET | `/api/submissions/:id` | Admin / Owner | Full submission details |

Query params: `?page=1&limit=20&status=Accepted&problemId=...&collegeId=...`

---

### Leaderboard

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/leaderboard` | All | Student: own college; Admin: all colleges |
| GET | `/api/leaderboard/:collegeId` | Admin | Specific college leaderboard |
| POST | `/api/leaderboard/:collegeId/rebuild` | Admin | Force-rebuild from MongoDB |

**Student leaderboard response:**
```json
{
  "data": {
    "data": [
      { "rank": 1, "name": "Vikram Nair", "totalSolved": 8, "streak": 7, "score": 13 },
      { "rank": 2, "name": "Priya Sharma", "totalSolved": 5, "streak": 3, "score": 5 }
    ],
    "total": 2,
    "myRank": { "rank": 2, "score": 5 }
  }
}
```

---

## Architecture Details

### Multi-Tenant College Isolation

- Every `User` with `role: student` has a required `collegeId` foreign key
- The `authenticate` middleware attaches the full user (including `collegeId`) to `req.user`
- The `authorize('admin')` middleware blocks students from admin routes
- Student-facing leaderboard reads `req.user.collegeId` — students can never see another college's data
- Admin routes accept an explicit `collegeId` parameter for cross-college queries

### JWT Flow

```
Login → access token (15m) + refresh token (7d, stored in DB)
         │
         ▼
Authenticated request → Authorization: Bearer <accessToken>
         │
         ▼
Token expiry → POST /auth/refresh with refreshToken → new accessToken
         │
         ▼
Logout → refresh token cleared from DB (invalidated server-side)
```

### Redis Leaderboard (Sorted Sets)

```
Key format:  leaderboard:{collegeId}
Type:        Redis Sorted Set (ZSET)
Member:      userId (string)
Score:       totalSolved + floor(streak / 7) * 5

Operations:
  ZADD leaderboard:{id} <score> <userId>   ← upsert on each submission
  ZREVRANGE leaderboard:{id} 0 49 WITHSCORES  ← top 50 by score
  ZREVRANK leaderboard:{id} <userId>       ← user's rank (0-indexed)
  ZCARD leaderboard:{id}                   ← total members

TTL: 300 seconds (auto-rebuilt on cache miss from MongoDB)
```

### Judge0 Execution Flow

```
POST /submit
  │
  ├─ Fetch problem hidden test cases from MongoDB
  ├─ Create Submission record (status: Pending)
  │
  └─ For each test case:
       │
       ├─ POST /submissions → Judge0 → returns token
       ├─ Poll GET /submissions/{token} every 1s (max 20 attempts)
       └─ Decode base64 stdout/stderr
  │
  ├─ Determine overall status (Accepted / WA / TLE / RE / CE)
  ├─ Update Submission record
  ├─ Update Problem acceptance rate
  ├─ If Accepted:
  │    ├─ Increment user.totalSolved (first solve only)
  │    ├─ Update streak (consecutive day logic)
  │    ├─ ZADD Redis leaderboard with new score
  │    └─ Add problem to user.solvedProblems
  └─ Return result to client
```

### Score Formula

```
leaderboard_score = totalSolved + floor(streak / 7) * 5

Example: 15 solved, 14-day streak
  = 15 + floor(14/7) * 5
  = 15 + 10
  = 25
```

---

## Error Response Format

All errors follow:
```json
{
  "success": false,
  "message": "Descriptive error message"
}
```

HTTP status codes: `400` validation, `401` auth, `403` forbidden, `404` not found, `409` conflict, `422` schema error, `429` rate limit, `500` server error.

---

## Rate Limiting

| Limiter | Window | Max Requests | Applied To |
|---|---|---|---|
| Global API | 1 min | 200 | All `/api/*` routes |
| Auth | 15 min | 10 | `/api/auth/login` |
| Submission | 1 min | 5 per user | `/api/execute`, `/api/submit` |

---

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong random strings for `JWT_SECRET` and `JWT_REFRESH_SECRET` (32+ chars)
- [ ] Use MongoDB Atlas with auth
- [ ] Use Redis Cloud or ElastiCache
- [ ] Add SSL/TLS (nginx reverse proxy recommended)
- [ ] Set `CLIENT_URL` to your frontend domain for CORS
- [ ] Enable MongoDB indexes: `npm run seed` creates them via Mongoose
- [ ] Monitor with PM2: `pm2 start server.js --name coding-platform`
- [ ] Set up log rotation for `logs/` directory in production
