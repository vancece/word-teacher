#!/bin/bash
# Word Teacher 测试数据重置脚本
# 用法: ./scripts/seed-dev.sh
#
# 幂等：每次运行都会清空并重建数据
# 依赖：MySQL 已启动且可连接

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}✓${NC} $1"; }
log_step()  { echo -e "${CYAN}→${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# 从 backend/.env 读取 DATABASE_URL
get_db_config() {
  local env_file="$PROJECT_DIR/backend/.env"
  if [ ! -f "$env_file" ]; then
    log_error "backend/.env 不存在，请先运行 ./scripts/dev-start.sh"
    exit 1
  fi

  local db_url
  db_url=$(grep "^DATABASE_URL" "$env_file" | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")

  DB_USER=$(echo "$db_url" | sed -n 's|mysql://\([^:]*\):.*|\1|p')
  DB_PASS=$(echo "$db_url" | sed -n 's|mysql://[^:]*:\([^@]*\)@.*|\1|p')
  DB_HOST=$(echo "$db_url" | sed -n 's|mysql://[^@]*@\([^:]*\):.*|\1|p')
  DB_PORT=$(echo "$db_url" | sed -n 's|mysql://[^@]*@[^:]*:\([0-9]*\)/.*|\1|p')
  DB_NAME=$(echo "$db_url" | sed -n 's|mysql://[^/]*/\([^?]*\).*|\1|p')

  if [ -z "$DB_USER" ] || [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ]; then
    log_error "无法解析 DATABASE_URL: $db_url"
    exit 1
  fi
}

# MySQL 连接参数
mysql_cmd() {
  local pass_arg=""
  [ -n "$DB_PASS" ] && pass_arg="-p${DB_PASS}"
  mysql -u "$DB_USER" $pass_arg -h "$DB_HOST" -P "$DB_PORT" "$DB_NAME" "$@"
}

main() {
  echo ""
  echo -e "${CYAN}🌱 Word Teacher 测试数据重置${NC}"
  echo ""

  get_db_config
  log_info "数据库: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

  # 测试连接
  log_step "测试数据库连接..."
  if ! mysql_cmd -e "SELECT 1" >/dev/null 2>&1; then
    log_error "无法连接数据库！请确保 MySQL 已启动"
    exit 1
  fi
  log_info "数据库连接正常"

  # 生成 SQL 文件（避免 $ 转义问题）
  local sql_file
  sql_file=$(mktemp /tmp/word-teacher-seed.XXXXXX.sql)
  trap "rm -f $sql_file" EXIT

  cat > "$sql_file" << 'EOSQL'
-- Word Teacher 测试数据
-- 密码: 123456 (bcrypt hash)

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE word_game_records;
TRUNCATE TABLE read_aloud_records;
TRUNCATE TABLE practice_records;
TRUNCATE TABLE assistant_conversations;

TRUNCATE TABLE words;
TRUNCATE TABLE word_packs;
TRUNCATE TABLE read_aloud_scenes;
TRUNCATE TABLE scenes;
TRUNCATE TABLE students;
TRUNCATE TABLE class_teachers;
TRUNCATE TABLE classes;
TRUNCATE TABLE teachers;
SET FOREIGN_KEY_CHECKS = 1;

-- 教师 (密码: 123456)
INSERT INTO teachers (id, username, password, name, is_admin, created_at, updated_at) VALUES
(1, 'admin', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '管理员', true, NOW(), NOW()),
(2, 'xiaomei', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '小美老师', false, NOW(), NOW()),
(3, 'zhangsan', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '张三老师', false, NOW(), NOW());

-- 班级
INSERT INTO classes (id, name, grade, description, created_at, updated_at) VALUES
(1, '三年级1班', '三年级', '小美老师的班级', NOW(), NOW()),
(2, '三年级2班', '三年级', '张三老师的班级', NOW(), NOW()),
(3, '四年级1班', '四年级', '跨年级测试', NOW(), NOW());

-- 班级-教师关联
INSERT INTO class_teachers (class_id, teacher_id, created_at) VALUES
(1, 2, NOW()),
(2, 3, NOW()),
(3, 2, NOW());

-- 学生 (密码: 123456)
-- 注意: studentNo 列名与 Prisma schema 中 @map 映射可能不一致，此处使用实际数据库列名
INSERT INTO students (id, studentNo, password, name, class_id, seat_no, created_at, updated_at) VALUES
(1, '2026050101', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '张小明', 1, 1, NOW(), NOW()),
(2, '2026050102', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '李小红', 1, 2, NOW(), NOW()),
(3, '2026050103', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '王小华', 1, 3, NOW(), NOW()),
(4, '2026050201', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '赵小刚', 2, 1, NOW(), NOW()),
(5, '2026050202', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '孙小丽', 2, 2, NOW(), NOW()),
(6, '2026050301', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', '周小军', 3, 1, NOW(), NOW());

-- 对话场景
INSERT INTO scenes (id, name, description, rounds, grade, visible, vocabulary, dialogue_config, creator_id, created_at) VALUES
('scene_greet', '打招呼', '学习日常英语问候语', 5, '三年级', true,
 '["hello", "hi", "good morning", "nice to meet you"]',
 '{"persona": "friendly English teacher", "topic": "greetings"}', 2, NOW()),
('scene_food', '美食天地', '聊聊你喜欢的食物', 5, '三年级', true,
 '["food", "eat", "delicious", "fruit", "vegetable"]',
 '{"persona": "friendly chef", "topic": "food and cooking"}', 2, NOW()),
('scene_animal', '动物世界', '聊聊你喜欢的动物', 5, '四年级', true,
 '["dog", "cat", "bird", "fish", "elephant"]',
 '{"persona": "friendly zookeeper", "topic": "animals"}', 3, NOW());

-- 跟读场景
INSERT INTO read_aloud_scenes (id, name, description, grade, visible, sentences, creator_id, created_at) VALUES
('read_daily', '日常问候', '学习日常英语问候表达', '基础', true,
 '[{"id":"s1","english":"Good morning! How are you today?","chinese":"早上好！你今天怎么样？"},{"id":"s2","english":"I am fine, thank you.","chinese":"我很好，谢谢。"},{"id":"s3","english":"What is your name?","chinese":"你叫什么名字？"},{"id":"s4","english":"My name is Tom.","chinese":"我叫汤姆。"},{"id":"s5","english":"Nice to meet you!","chinese":"很高兴认识你！"}]',
 2, NOW()),
('read_colors', '颜色乐园', '学习颜色相关的英语表达', '基础', true,
 '[{"id":"s1","english":"The sky is blue.","chinese":"天空是蓝色的。"},{"id":"s2","english":"The sun is yellow.","chinese":"太阳是黄色的。"},{"id":"s3","english":"The grass is green.","chinese":"草是绿色的。"},{"id":"s4","english":"I like red flowers.","chinese":"我喜欢红色的花。"}]',
 2, NOW());

-- 词包
INSERT INTO word_packs (id, name, description, game_type, grade, visible, sort_order, creator_id, created_at, updated_at) VALUES
(1, '动物世界', '常见动物英语单词', 'shooter', '三年级', true, 1, 2, NOW(), NOW()),
(2, '水果乐园', '常见水果英语单词', 'match', '三年级', true, 2, 2, NOW(), NOW()),
(3, '颜色彩虹', '颜色相关英语单词', 'spell', '基础', true, 3, 3, NOW(), NOW());

INSERT INTO words (pack_id, english, chinese, phonetic, difficulty, sort_order) VALUES
(1, 'dog', '狗', '/dɒɡ/', 1, 1),
(1, 'cat', '猫', '/kæt/', 1, 2),
(1, 'bird', '鸟', '/bɜːd/', 1, 3),
(1, 'fish', '鱼', '/fɪʃ/', 1, 4),
(1, 'elephant', '大象', '/ˈelɪfənt/', 2, 5),
(1, 'tiger', '老虎', '/ˈtaɪɡə/', 2, 6),
(2, 'apple', '苹果', '/ˈæpl/', 1, 1),
(2, 'banana', '香蕉', '/bəˈnɑːnə/', 1, 2),
(2, 'orange', '橙子', '/ˈɒrɪndʒ/', 1, 3),
(2, 'grape', '葡萄', '/ɡreɪp/', 1, 4),
(2, 'watermelon', '西瓜', '/ˈwɔːtəmelən/', 2, 5),
(3, 'red', '红色', '/red/', 1, 1),
(3, 'blue', '蓝色', '/bluː/', 1, 2),
(3, 'green', '绿色', '/ɡriːn/', 1, 3),
(3, 'yellow', '黄色', '/ˈjeləʊ/', 1, 4),
(3, 'purple', '紫色', '/ˈpɜːpl/', 1, 5);

-- 对话练习记录
INSERT INTO practice_records (student_id, scene_id, total_score, pronunciation_score, fluency_score, grammar_score, duration_seconds, rounds_completed, status, created_at, updated_at) VALUES
(1, 'scene_greet', 85, 80, 90, 85, 180, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
(1, 'scene_greet', 90, 88, 92, 90, 165, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),
(1, 'scene_food', 78, 75, 80, 79, 200, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),
(2, 'scene_greet', 92, 90, 95, 91, 150, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),
(2, 'scene_food', 88, 85, 90, 89, 175, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY)),
(3, 'scene_greet', 70, 65, 72, 73, 220, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),
(3, 'scene_greet', 75, 72, 78, 75, 195, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),
(4, 'scene_greet', 82, 80, 85, 81, 185, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),
(4, 'scene_animal', 88, 86, 90, 88, 170, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),
(5, 'scene_greet', 95, 93, 97, 95, 140, 5, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY)),
(6, 'scene_animal', 60, 55, 62, 63, 250, 3, 'ABANDONED', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),
(1, 'scene_food', NULL, NULL, NULL, NULL, NULL, 2, 'IN_PROGRESS', NOW(), NOW());

-- 跟读记录
INSERT INTO read_aloud_records (student_id, scene_id, completed_count, total_count, duration_seconds, status, total_score, intonation_score, fluency_score, accuracy_score, expression_score, feedback, created_at, updated_at) VALUES
(1, 'read_daily', 5, 5, 120, 'COMPLETED', 4, 4, 4, 5, 3, '发音很标准，继续保持！', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),
(1, 'read_colors', 4, 4, 95, 'COMPLETED', 5, 5, 4, 5, 5, '太棒了！完美的朗读！', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),
(2, 'read_daily', 5, 5, 130, 'COMPLETED', 4, 4, 5, 4, 4, '语调很自然，表达清晰。', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),
(3, 'read_daily', 3, 5, 90, 'IN_PROGRESS', NULL, NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),
(4, 'read_daily', 5, 5, 145, 'COMPLETED', 3, 3, 3, 4, 3, '基本功扎实，注意连读。', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY));

-- 单词游戏记录
INSERT INTO word_game_records (student_id, game_type, pack_name, score, summary, created_at) VALUES
(1, 'shooter', '动物世界', 850, '命中率 85%，连击 x5', DATE_SUB(NOW(), INTERVAL 4 DAY)),
(1, 'match', '水果乐园', 920, '全部配对成功，用时 45 秒', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(2, 'shooter', '动物世界', 760, '命中率 76%，连击 x3', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(2, 'spell', '颜色彩虹', 880, '拼写正确率 88%', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(4, 'shooter', '动物世界', 930, '命中率 93%，连击 x8', DATE_SUB(NOW(), INTERVAL 2 DAY));


EOSQL

  log_step "清空并重建数据..."
  mysql_cmd < "$sql_file" 2>/dev/null
  log_info "数据写入完成"

  # 验证
  local counts
  counts=$(mysql_cmd -N -e "
    SELECT 'teachers', COUNT(*) FROM teachers
    UNION ALL SELECT 'classes', COUNT(*) FROM classes
    UNION ALL SELECT 'students', COUNT(*) FROM students
    UNION ALL SELECT 'scenes', COUNT(*) FROM scenes
    UNION ALL SELECT 'read_aloud_scenes', COUNT(*) FROM read_aloud_scenes
    UNION ALL SELECT 'word_packs', COUNT(*) FROM word_packs
    UNION ALL SELECT 'words', COUNT(*) FROM words
    UNION ALL SELECT 'practice_records', COUNT(*) FROM practice_records
    UNION ALL SELECT 'read_aloud_records', COUNT(*) FROM read_aloud_records
    UNION ALL SELECT 'word_game_records', COUNT(*) FROM word_game_records;
  " 2>/dev/null)

  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  ✓ 测试数据重置完成！${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  📊 数据统计:"
  echo "$counts" | while read -r table count; do
    printf "     %-20s %s\n" "$table" "$count"
  done
  echo ""
  echo "  🔑 测试账号:"
  echo "     管理员: admin / 123456"
  echo "     教师:   xiaomei / 123456"
  echo "     学生:   2026050101 ~ 2026050301 / 123456"
  echo ""
}

main "$@"
