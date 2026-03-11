# 用户表拆分方案

## 背景

当前 `User` 表同时存储学生和教师，通过 `role` 字段区分。这导致：
- 登录接口混用，需要前端判断角色
- 数据模型混乱（学生有 `classId`/`seatNo`，教师有 `isAdmin`）
- 无法在数据库层面强制隔离

## 目标

- **学生表 `Student`** - 仅存储学生信息
- **教师表 `Teacher`** - 仅存储教师信息
- **分离的登录接口** - 学生端和教师端使用不同的 API
- **JWT 中包含用户类型** - 防止跨端访问

---

## 数据库改动

### 新增表结构

```prisma
// 学生表
model Student {
  id        Int      @id @default(autoincrement())
  studentNo String   @unique @db.VarChar(50)  // 学号
  password  String   @db.VarChar(255)
  name      String   @db.VarChar(50)
  classId   Int      @map("class_id")
  seatNo    Int?     @map("seat_no")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  class            Class            @relation(fields: [classId], references: [id], onDelete: Cascade)
  practiceRecords  PracticeRecord[]
  readAloudRecords ReadAloudRecord[]

  @@map("students")
}

// 教师表
model Teacher {
  id        Int      @id @default(autoincrement())
  username  String   @unique @db.VarChar(50)
  password  String   @db.VarChar(255)
  name      String   @db.VarChar(50)
  isAdmin   Boolean  @default(false) @map("is_admin")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  classes              ClassTeacher[]
  createdScenes        Scene[]          @relation("SceneCreator")
  createdReadAloudScenes ReadAloudScene[] @relation("ReadAloudSceneCreator")

  @@map("teachers")
}
```

### 关联表改动

```prisma
// ClassTeacher 改为关联 Teacher
model ClassTeacher {
  classId   Int @map("class_id")
  teacherId Int @map("teacher_id")
  
  class   Class   @relation(fields: [classId], references: [id])
  teacher Teacher @relation(fields: [teacherId], references: [id])  // 改为 Teacher
}

// PracticeRecord 改为关联 Student
model PracticeRecord {
  studentId Int @map("student_id")
  student   Student @relation(fields: [studentId], references: [id])  // 改为 Student
}

// ReadAloudRecord 改为关联 Student
model ReadAloudRecord {
  studentId Int @map("student_id")
  student   Student @relation(fields: [studentId], references: [id])  // 改为 Student
}

// Scene.creator 改为 Teacher
model Scene {
  creatorId Int? @map("creator_id")
  creator   Teacher? @relation(fields: [creatorId], references: [id])  // 改为 Teacher
}
```

---

## API 改动

### 新增路由

| 路由 | 说明 |
|------|------|
| `POST /api/student/auth/login` | 学生登录 |
| `POST /api/student/auth/register` | 学生注册 |
| `GET /api/student/auth/me` | 获取学生信息 |
| `POST /api/teacher/auth/login` | 教师登录 |
| `GET /api/teacher/auth/me` | 获取教师信息 |

### 删除/废弃路由

| 路由 | 处理方式 |
|------|---------|
| `POST /api/auth/login` | 废弃，返回提示使用新接口 |
| `POST /api/auth/register` | 废弃 |

### JWT Payload 改动

```typescript
// 学生 Token
interface StudentJwtPayload {
  type: 'student'
  studentId: number
  studentNo: string
  classId: number
}

// 教师 Token
interface TeacherJwtPayload {
  type: 'teacher'
  teacherId: number
  username: string
  isAdmin: boolean
}
```

---

## 前端改动

### 学生端 (frontend)

| 文件 | 改动 |
|------|------|
| `api/auth.ts` | 调用 `/api/student/auth/*` |
| `contexts/AuthContext.tsx` | 存储 `student` 而非 `user` |
| `types/index.ts` | `User` → `Student` |

### 教师端 (admin)

| 文件 | 改动 |
|------|------|
| `api/auth.ts` | 调用 `/api/teacher/auth/*` |
| `contexts/AuthContext.tsx` | 存储 `teacher` 而非 `user` |

---

## 中间件改动

### 新增认证中间件

```typescript
// 学生端认证
function authenticateStudent(req, res, next) {
  const payload = verifyToken(token)
  if (payload?.type !== 'student') {
    return forbidden(res, '仅学生可访问')
  }
  req.student = payload
  next()
}

// 教师端认证
function authenticateTeacher(req, res, next) {
  const payload = verifyToken(token)
  if (payload?.type !== 'teacher') {
    return forbidden(res, '仅教师可访问')
  }
  req.teacher = payload
  next()
}
```

---

## 数据迁移

### 迁移脚本

```sql
-- 1. 创建新表
CREATE TABLE students (...);
CREATE TABLE teachers (...);

-- 2. 迁移学生数据
INSERT INTO students (student_no, password, name, class_id, seat_no, created_at, updated_at)
SELECT username, password, name, class_id, seat_no, created_at, updated_at
FROM users WHERE role = 'STUDENT';

-- 3. 迁移教师数据
INSERT INTO teachers (username, password, name, is_admin, created_at, updated_at)
SELECT username, password, name, is_admin, created_at, updated_at
FROM users WHERE role IN ('TEACHER', 'ADMIN');

-- 4. 更新外键关系（需要映射旧 ID 到新 ID）
-- ... 详细迁移脚本

-- 5. 删除旧表
DROP TABLE users;
```

---

## 影响范围汇总

### Backend (约 15 个文件)

| 文件 | 改动类型 |
|------|---------|
| `prisma/schema.prisma` | 重写 |
| `routes/auth.routes.ts` | 拆分为 student/teacher |
| `routes/admin/*.ts` | 改用 Teacher 关联 |
| `middleware/auth.ts` | 新增 authenticateStudent/Teacher |
| `types/index.ts` | 新增类型定义 |
| `routes/practice.routes.ts` | 改用 Student 关联 |
| `routes/read-aloud.routes.ts` | 改用 Student 关联 |
| `services/*.ts` | 更新查询 |

### Frontend 学生端 (约 8 个文件)

| 文件 | 改动类型 |
|------|---------|
| `api/auth.ts` | 改用新 API |
| `api/client.ts` | 无变化 |
| `contexts/AuthContext.tsx` | User → Student |
| `types/index.ts` | 类型定义 |
| `pages/LoginPage.tsx` | 可能调整 |
| `pages/ProfilePage.tsx` | 字段调整 |

### Admin 教师端 (约 6 个文件)

| 文件 | 改动类型 |
|------|---------|
| `api/auth.ts` | 改用新 API |
| `contexts/AuthContext.tsx` | User → Teacher |
| `pages/LoginPage.tsx` | 可能调整 |
| `pages/TeachersPage.tsx` | 数据源变更 |

---

## 实施步骤

### Phase 1: 数据库 + Backend (Day 1-2) ✅ 已完成
1. ✅ 新建 `Student` 和 `Teacher` 模型（Prisma schema）
2. ✅ 新增 `/api/student/auth/*` 和 `/api/teacher/auth/*` 路由
3. ✅ 新增 `authenticateStudent` / `authenticateTeacher` 中间件
4. ✅ 更新所有后端路由使用新的认证和模型

### Phase 2: Frontend (Day 3) 🔲 待实施
1. 学生端改用新 API (`/api/student/auth/login`)
2. 教师端改用新 API (`/api/teacher/auth/login`)
3. 更新 AuthContext 类型定义
4. 测试登录/注册流程

### Phase 3: 数据迁移 + 清理 (Day 4) 🔲 待实施
1. 运行 Prisma 数据库迁移
2. 编写数据迁移脚本将现有 users 表数据分流
3. 删除旧 `User` 表
4. 删除旧 `/api/auth/*` 路由

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 数据迁移失败 | 高 | 先备份，支持回滚 |
| 前端遗漏改动 | 中 | 统一搜索 `User` 类型 |
| Token 失效 | 中 | 过渡期同时支持新旧格式 |

---

## 建议

**是否值得拆分？**

✅ **推荐拆分**，理由：
1. 数据模型更清晰
2. 安全性更强（数据库层面隔离）
3. 代码可维护性更好
4. 未来扩展更灵活（学生/教师字段可以独立演进）

**替代方案（如果不拆分）**：
- 在登录 API 中增加 `clientType` 参数
- JWT 中增加 `allowedClients: ['student' | 'teacher']`
- 中间件检查 client 类型
- 工作量更小，但数据模型仍混乱

