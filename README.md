# 使用说明

创建nodejs项目

安装`npm install js-pbbot`

代码
```javascript
let {createBotWsServer, EventHandler, Msg} =require('js-pbbot')

EventHandler.handlePrivateMessage = async (bot, event) => {
  let msg = Msg.builder().text("hello world")
  await bot.sendPrivateMessage(event.userId, msg)
}

createBotWsServer(8081)
```

运行[GMC](https://github.com/protobufbot/Go-Mirai-Client/releases)，登陆机器人QQ
