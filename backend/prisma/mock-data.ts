import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// 生成随机分数 (基础分 + 波动 + 进步趋势)
function generateScore(base: number, index: number, totalRecords: number): number {
  const progress = (index / totalRecords) * 15 // 最多进步15分
  const fluctuation = Math.random() * 10 - 5 // -5 到 +5 的波动
  return Math.min(100, Math.max(40, Math.round(base + progress + fluctuation)))
}

// 生成过去N天的日期
function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

async function main() {
  console.log('🌱 Creating mock data...')
  const hashedPassword = await bcrypt.hash('123456', 10)

  // 1. 创建班级
  console.log('\n📚 Creating classes...')
  const classesData = [
    { name: '三年级1班', grade: '三年级', description: '三年级第一班' },
    { name: '三年级2班', grade: '三年级', description: '三年级第二班' },
    { name: '四年级1班', grade: '四年级', description: '四年级第一班' },
    { name: '四年级2班', grade: '四年级', description: '四年级第二班' },
  ]

  const classMap = new Map<string, number>()
  for (const c of classesData) {
    const cls = await prisma.class.upsert({
      where: { id: classesData.indexOf(c) + 1 },
      update: { name: c.name, grade: c.grade, description: c.description },
      create: { name: c.name, grade: c.grade, description: c.description },
    })
    classMap.set(c.name, cls.id)
    console.log(`✅ Class: ${cls.name} (ID: ${cls.id})`)
  }

  // 2. 创建多个学生（关联班级）
  console.log('\n👨‍🎓 Creating students...')
  const studentsData = [
    { username: 'student002', name: '李华', className: '三年级1班' },
    { username: 'student003', name: '王芳', className: '三年级1班' },
    { username: 'student004', name: '张伟', className: '三年级2班' },
    { username: 'student005', name: '刘洋', className: '三年级2班' },
    { username: 'student006', name: '陈静', className: '四年级1班' },
    { username: 'student007', name: '杨帆', className: '四年级1班' },
    { username: 'student008', name: '赵敏', className: '四年级2班' },
    { username: 'student009', name: '周杰', className: '四年级2班' },
  ]

  const createdStudents = []
  for (const s of studentsData) {
    const classId = classMap.get(s.className)
    const student = await prisma.user.upsert({
      where: { username: s.username },
      update: { classId },
      create: {
        username: s.username,
        name: s.name,
        password: hashedPassword,
        role: 'STUDENT',
        classId,
      },
    })
    createdStudents.push(student)
    console.log(`✅ Student: ${student.name} (classId: ${student.classId})`)
  }

  // 更新原有的学生 student001 到三年级2班
  const existingStudent = await prisma.user.findUnique({ where: { username: 'student001' } })
  if (existingStudent) {
    const classId = classMap.get('三年级2班')
    await prisma.user.update({
      where: { id: existingStudent.id },
      data: { classId },
    })
    createdStudents.unshift({ ...existingStudent, classId })
    console.log(`✅ Updated existing student: ${existingStudent.name} (classId: ${classId})`)
  }

  // 2. 获取场景
  const scenes = await prisma.scene.findMany()
  const readAloudScenes = await prisma.readAloudScene.findMany()

  console.log(`\n📚 Found ${scenes.length} dialogue scenes, ${readAloudScenes.length} read-aloud scenes`)

  // 3. 为每个学生创建对话练习记录（模拟30天内的练习）
  console.log('\n📝 Creating practice records...')
  for (const student of createdStudents) {
    const baseScore = 50 + Math.random() * 20 // 基础分 50-70
    const recordCount = 8 + Math.floor(Math.random() * 8) // 每人 8-15 条记录

    for (let i = 0; i < recordCount; i++) {
      const scene = scenes[Math.floor(Math.random() * scenes.length)]
      const daysOffset = Math.floor((30 / recordCount) * i) + Math.floor(Math.random() * 3)
      
      await prisma.practiceRecord.create({
        data: {
          studentId: student.id,
          sceneId: scene.id,
          totalScore: generateScore(baseScore, i, recordCount),
          pronunciationScore: generateScore(baseScore - 5, i, recordCount),
          fluencyScore: generateScore(baseScore, i, recordCount),
          grammarScore: generateScore(baseScore + 5, i, recordCount),
          roundsCompleted: 5,
          durationSeconds: 120 + Math.floor(Math.random() * 180),
          feedbackText: '练习完成，继续加油！',
          dialogueHistory: generateMockDialogue(scene.name),
          status: 'COMPLETED',
          createdAt: daysAgo(30 - daysOffset),
          updatedAt: daysAgo(30 - daysOffset),
        },
      })
    }
    console.log(`  ✅ ${student.name}: ${recordCount} practice records`)
  }

  // 4. 为每个学生创建跟读练习记录（100分制）
  console.log('\n🎤 Creating read-aloud records...')
  for (const student of createdStudents) {
    const baseScore = 50 + Math.random() * 20 // 基础分 50-70 (100分制)
    const recordCount = 6 + Math.floor(Math.random() * 6) // 每人 6-11 条记录

    for (let i = 0; i < recordCount; i++) {
      const scene = readAloudScenes[Math.floor(Math.random() * readAloudScenes.length)]
      const daysOffset = Math.floor((30 / recordCount) * i) + Math.floor(Math.random() * 3)
      const totalScore = generateScore(baseScore, i, recordCount)

      const sentenceCount = (scene.sentences as any[])?.length || 5
      await prisma.readAloudRecord.create({
        data: {
          studentId: student.id,
          sceneId: scene.id,
          completedCount: sentenceCount,
          totalCount: sentenceCount,
          totalScore: totalScore,
          pronunciationScore: generateScore(baseScore - 5, i, recordCount),
          completionScore: generateScore(baseScore, i, recordCount),
          fluencyScore: generateScore(baseScore - 3, i, recordCount),
          effortScore: generateScore(baseScore + 5, i, recordCount),
          feedback: '发音不错，继续保持！',
          strengths: ['发音清晰', '语调自然'],
          improvements: ['注意连读', '加快语速'],
          status: 'COMPLETED',
          createdAt: daysAgo(30 - daysOffset),
          updatedAt: daysAgo(30 - daysOffset),
        },
      })
    }
    console.log(`  ✅ ${student.name}: ${recordCount} read-aloud records`)
  }

  console.log('\n🎉 Mock data created successfully!')
}

function generateMockDialogue(sceneName: string): any[] {
  return [
    { id: '1', role: 'ai', text: `Hello! Let's practice "${sceneName}" today.`, timestamp: Date.now() },
    { id: '2', role: 'student', text: 'Hello! I am ready.', timestamp: Date.now() + 1000 },
    { id: '3', role: 'ai', text: 'Great! How are you today?', timestamp: Date.now() + 2000 },
    { id: '4', role: 'student', text: 'I am fine, thank you.', timestamp: Date.now() + 3000 },
    { id: '5', role: 'ai', text: 'Wonderful! You did a great job!', timestamp: Date.now() + 4000 },
  ]
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

