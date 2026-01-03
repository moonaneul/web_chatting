const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. MySQL 연결 설정 ---
// 본인의 MySQL 비밀번호를 'your_password' 자리에 넣으세요.
const sequelize = new Sequelize('chat_db', 'root', '00000000', {
  host: '127.0.0.1',
  dialect: 'mysql',
  logging: false,
});

// --- 2. 데이터 모델 정의 ---
const Message = sequelize.define('Message', {
  name: { type: DataTypes.STRING, allowNull: false },
  msg: { type: DataTypes.TEXT },
  image: { type: DataTypes.TEXT('long') }, // 이미지를 위해 LONGTEXT 사용
  time: { type: DataTypes.STRING },
  type: { type: DataTypes.STRING },
});

// DB 동기화
sequelize.sync()
  .then(() => console.log('MySQL 연결 및 테이블 동기화 완료'))
  .catch(err => console.error('MySQL 연결 에러:', err));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- 3. 실시간 소켓 로직 ---
let connectedUsers = {}; // 접속자 추적용 객체

io.on('connection', async (socket) => {
  console.log('새로운 유저 접속');

  // 접속 시 과거 내역 50개 불러오기
  try {
    const history = await Message.findAll({
      order: [['createdAt', 'ASC']],
      limit: 50
    });
    socket.emit('chat history', history);
  } catch (err) {
    console.error('내역 불러오기 실패:', err);
  }

  // 닉네임 설정 및 입장 처리
  socket.on('set nickname', (nickname) => {
    socket.nickname = nickname;
    connectedUsers[socket.id] = nickname; // 명단에 추가

    // 접속자 명단 업데이트 브로드캐스트
    io.emit('update user list', Object.values(connectedUsers));
    
    io.emit('chat message', {
      name: '시스템',
      msg: `${nickname}님이 입장하셨습니다.`,
      type: 'system'
    });
  });

  // 메시지 수신 및 저장
  socket.on('chat message', async (data) => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', minute: '2-digit', hour12: true 
    });

    try {
      const savedMsg = await Message.create({
        name: data.name,
        msg: data.msg,
        image: data.image,
        time: timeString,
        type: 'user'
      });
      io.emit('chat message', savedMsg);
    } catch (err) {
      console.error('메시지 저장 중 에러:', err);
    }
  });

  // 타이핑 상태 전달
  socket.on('typing', () => {
    socket.broadcast.emit('typing', { name: socket.nickname });
  });

  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing');
  });

  // 퇴장 처리
  socket.on('disconnect', () => {
    if (socket.nickname) {
      delete connectedUsers[socket.id]; // 명단에서 제거
      io.emit('update user list', Object.values(connectedUsers));
      io.emit('chat message', {
        name: '시스템',
        msg: `${socket.nickname}님이 나갔습니다.`,
        type: 'system'
      });
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});