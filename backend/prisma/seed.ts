import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const hashedPassword = await bcrypt.hash('123456', 10)

  // 1. 创建管理员教师
  const admin = await prisma.teacher.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      name: '管理员',
      isAdmin: true,
    },
  })
  console.log('✅ Created admin teacher:', admin.name)

  // 2. 创建普通教师
  const xiaomei = await prisma.teacher.upsert({
    where: { username: 'xiaomei' },
    update: {},
    create: {
      username: 'xiaomei',
      password: hashedPassword,
      name: '小美老师',
      isAdmin: false,
    },
  })
  console.log('✅ Created teacher:', xiaomei.name)

  // 3. 创建班级
  const class1 = await prisma.class.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: '三年级1班',
      grade: '三年级',
      description: '示例班级',
    },
  })
  console.log('✅ Created class:', class1.name)

  // 4. 关联教师和班级
  await prisma.classTeacher.upsert({
    where: { classId_teacherId: { classId: class1.id, teacherId: xiaomei.id } },
    update: {},
    create: { classId: class1.id, teacherId: xiaomei.id },
  })
  console.log('✅ Linked teacher to class')

  // 5. 创建示例学生
  const student = await prisma.student.upsert({
    where: { studentNo: '2026050101' },
    update: {},
    create: {
      studentNo: '2026050101',
      password: hashedPassword,
      name: '张小明',
      classId: class1.id,
      seatNo: 1,
    },
  })
  console.log('✅ Created student:', student.name)

  // 创建示例对话场景
  const dialogueScene = await prisma.scene.upsert({
    where: { id: 'scene_demo' },
    update: {},
    create: {
      id: 'scene_demo',
      name: '打招呼',
      description: '学习日常问候和自我介绍。',
      rounds: 3,
      icon: '/images/scenes/greeting.png',
      grade: '基础',
      vocabulary: ['hello', 'hi', 'morning', 'name', 'nice', 'meet'],
      dialogueConfig: {
        prompts: [
          "Hello! Good morning! I'm your AI teacher. How are you today?",
          'Nice to meet you! What is your name?',
          'Great! Do you like learning English?',
        ],
      },
    },
  })
  console.log('✅ Created dialogue scene:', dialogueScene.name)

  // 创建示例跟读场景
  const readAloudScene = await prisma.readAloudScene.upsert({
    where: { id: 'read_demo' },
    update: {},
    create: {
      id: 'read_demo',
      name: '日常问候',
      description: '学习最基本的英语问候语',
      grade: '基础',
      sentences: [
        { id: 1, english: 'Hello!', chinese: '你好！' },
        { id: 2, english: 'Good morning!', chinese: '早上好！' },
        { id: 3, english: 'How are you?', chinese: '你好吗？' },
        { id: 4, english: 'Nice to meet you!', chinese: '很高兴认识你！' },
        { id: 5, english: 'My name is Tom.', chinese: '我的名字是汤姆。' },
      ],
    },
  })
  console.log('✅ Created read-aloud scene:', readAloudScene.name)

  console.log('')
  console.log('🎉 Seeding completed!')
  console.log('')
  console.log('📝 测试账号:')
  console.log('   管理员: admin / 123456')
  console.log('   教师:   xiaomei / 123456')
  console.log('   学生:   2026050101 / 123456')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

