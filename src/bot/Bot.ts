import Long from "long";
import WebSocket from "ws";
import LRUCache from 'lru-cache'
import EventHandler from "./EventHandler";
import Msg from "../util/Msg";
import IdGenerator from "../util/IdGenerator";
import WaitingFrame from "./WaitingFrame";
import {onebot} from "../proto/proto";
import Frame = onebot.Frame;
import IFrame = onebot.IFrame;
import FrameType = onebot.Frame.FrameType;
import ISendGroupMsgResp = onebot.ISendGroupMsgResp;
import ISendPrivateMsgResp = onebot.ISendPrivateMsgResp;
import IDeleteMsgResp = onebot.IDeleteMsgResp;
import IGetMsgResp = onebot.IGetMsgResp;
import ISetGroupKickResp = onebot.ISetGroupKickResp;
import ISetGroupBanResp = onebot.ISetGroupBanResp;
import ISetGroupWholeBanResp = onebot.ISetGroupWholeBanResp;
import ISetGroupCardResp = onebot.ISetGroupCardResp;
import ISetGroupLeaveResp = onebot.ISetGroupLeaveResp;
import ISetGroupSpecialTitleResp = onebot.ISetGroupSpecialTitleResp;
import ISetFriendAddRequestResp = onebot.ISetFriendAddRequestResp;
import ISetGroupAddRequestResp = onebot.ISetGroupAddRequestResp;
import IGetLoginInfoResp = onebot.IGetLoginInfoResp;
import IGetStrangerInfoResp = onebot.IGetStrangerInfoResp;
import IGetFriendListResp = onebot.IGetFriendListResp;
import IGetGroupListResp = onebot.IGetGroupListResp;
import IGetGroupInfoResp = onebot.IGetGroupInfoResp;
import IGetGroupMemberInfoResp = onebot.IGetGroupMemberInfoResp;
import IGetGroupMemberListResp = onebot.IGetGroupMemberListResp;

export default class Bot {
  botId: Long
  session: WebSocket
  waitingFrames: LRUCache<string, WaitingFrame>

  static bots = new Map<Long, Bot>()

  constructor(botId: Long, session: WebSocket) {
    this.waitingFrames = new LRUCache<string, WaitingFrame>({
      max: 500,
      maxAge: 30 * 1000, // 30秒超时
      dispose(key: string, value: WaitingFrame) {
        value.reject("waiting timeout")
      }
    })
    this.botId = botId
    this.session = session
    this.session.on('message', async (data) => {
      let frame = Frame.decode(data as Buffer)
      try {
        await this.handleFrame(frame)
      } catch (e) {
        console.log("failed to handle frame")
        console.error(e)
      }
    })
  }

  async handleFrame(frame: IFrame) {
    !!frame.privateMessageEvent && await EventHandler.handlePrivateMessage(this, frame.privateMessageEvent)
    !!frame.groupMessageEvent && await EventHandler.handleGroupMessage(this, frame.groupMessageEvent)
    !!frame.groupUploadNoticeEvent && await EventHandler.handleGroupUploadNotice(this, frame.groupUploadNoticeEvent)
    !!frame.groupAdminNoticeEvent && await EventHandler.handleGroupAdminNotice(this, frame.groupAdminNoticeEvent)
    !!frame.groupDecreaseNoticeEvent && await EventHandler.handleGroupDecreaseNoticeEvent(this, frame.groupDecreaseNoticeEvent)
    !!frame.groupIncreaseNoticeEvent && await EventHandler.handleGroupIncreaseNoticeEvent(this, frame.groupIncreaseNoticeEvent)
    !!frame.groupBanNoticeEvent && await EventHandler.handleGroupBanNoticeEvent(this, frame.groupBanNoticeEvent)
    !!frame.friendAddNoticeEvent && await EventHandler.handleFriendAddNoticeEvent(this, frame.friendAddNoticeEvent)
    !!frame.groupRecallNoticeEvent && await EventHandler.handleGroupRecallNoticeEvent(this, frame.groupRecallNoticeEvent)
    !!frame.friendRecallNoticeEvent && await EventHandler.handleFriendRecallNoticeEvent(this, frame.friendRecallNoticeEvent)
    !!frame.friendRequestEvent && await EventHandler.handleFriendRequestEvent(this, frame.friendRequestEvent)
    !!frame.groupRequestEvent && await EventHandler.handleGroupRequestEvent(this, frame.groupRequestEvent)
    if ((frame.frameType || 0) > 300) {
      let waitingFrame = this.waitingFrames.get(frame.echo as string)
      if (!!waitingFrame) {
        waitingFrame.resolve(frame)
      }
      this.waitingFrames.del(frame.echo as string)
    }
  }

  sendFrame(frame: IFrame) {
    let sendingData = Frame.encode(frame).finish()
    this.session.send(sendingData)
  }

  async sendFrameAndWait(frame: IFrame): Promise<IFrame> {
    frame.botId = this.botId
    frame.echo = IdGenerator.generateStrId()
    frame.ok = true
    this.sendFrame(frame)
    return new Promise<IFrame>((resolve, reject) => {
      let waitingFrame: WaitingFrame = {
        resolve: resolve,
        reject: reject,
        echo: frame.echo as string,
      }
      this.waitingFrames.set(frame.echo as string, waitingFrame)
    })
  }

  async sendPrivateMessage(userId: Long, msg: Msg, autoEscape: boolean = true): Promise<ISendPrivateMsgResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSendPrivateMsgReq,
      sendPrivateMsgReq: {
        userId: userId,
        message: msg.messageList,
        autoEscape: autoEscape,
      }
    })
      .then(resp => resp.sendPrivateMsgResp || null)
      .catch(() => null)
  }

  async sendGroupMessage(groupId: Long, msg: Msg, autoEscape: boolean = true): Promise<ISendGroupMsgResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSendGroupMsgReq,
      sendGroupMsgReq: {
        groupId: groupId,
        message: msg.messageList,
        autoEscape: autoEscape,
      }
    }).then(resp => resp.sendGroupMsgResp || null)
      .catch(() => null)
  }

  async deleteMsg(messageId: number): Promise<IDeleteMsgResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TDeleteMsgReq,
      deleteMsgReq: {
        messageId: messageId,
      }
    }).then(resp => resp.deleteMsgResp || null)
      .catch(() => null)
  }

  async getMsg(messageId: number): Promise<IGetMsgResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetMsgReq,
      getMsgReq: {
        messageId: messageId,
      }
    }).then(resp => resp.getMsgResp || null)
      .catch(() => null)
  }

  async setGroupKick(groupId: Long, userId: Long, rejectAddRequest: boolean): Promise<ISetGroupKickResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetGroupKickReq,
      setGroupKickReq: {
        groupId: groupId,
        userId: userId,
        rejectAddRequest: rejectAddRequest,
      }
    }).then(resp => resp.setGroupKickResp || null)
      .catch(() => null)
  }

  async setGroupBan(groupId: Long, userId: Long, duration: number): Promise<ISetGroupBanResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetGroupBanReq,
      setGroupBanReq: {
        groupId: groupId,
        userId: userId,
        duration: duration,
      }
    }).then(resp => resp.setGroupBanResp || null)
      .catch(() => null)
  }

  async setGroupWholeBan(groupId: Long, enable: boolean): Promise<ISetGroupWholeBanResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetGroupWholeBanReq,
      setGroupWholeBanReq: {
        groupId: groupId,
        enable: enable,
      }
    }).then(resp => resp.setGroupWholeBanResp || null)
      .catch(() => null)
  }

  async setGroupCard(groupId: Long, userId: Long, card: string): Promise<ISetGroupCardResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetGroupCardReq,
      setGroupCardReq: {
        groupId: groupId,
        userId: userId,
        card: card,
      }
    }).then(resp => resp.setGroupCardResp || null)
      .catch(() => null)
  }

  async setGroupLeave(groupId: Long, isDismiss: boolean): Promise<ISetGroupLeaveResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetGroupLeaveReq,
      setGroupLeaveReq: {
        groupId: groupId,
        isDismiss: isDismiss,
      }
    }).then(resp => resp.setGroupLeaveResp || null)
      .catch(() => null)
  }

  async setGroupSpecialTitle(groupId: Long, userId: Long, specialTitle: string, duration: number): Promise<ISetGroupSpecialTitleResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetGroupSpecialTitleReq,
      setGroupSpecialTitleReq: {
        groupId: groupId,
        userId: userId,
        specialTitle: specialTitle,
        duration: Long.fromNumber(duration),
      }
    }).then(resp => resp.setGroupSpecialTitleResp || null)
      .catch(() => null)
  }

  async setFriendAddRequest(flag: string, approve: boolean, remark: string): Promise<ISetFriendAddRequestResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetFriendAddRequestReq,
      setFriendAddRequestReq: {
        flag: flag,
        approve: approve,
        remark: remark
      }
    }).then(resp => resp.setFriendAddRequestResp || null)
      .catch(() => null)
  }

  async setGroupAddRequest(flag: string, subType: string, approve: boolean, reason: string): Promise<ISetGroupAddRequestResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TSetGroupAddRequestReq,
      setGroupAddRequestReq: {
        flag: flag,
        subType: subType,
        approve: approve,
        reason: reason,
      }
    }).then(resp => resp.setGroupAddRequestResp || null)
      .catch(() => null)
  }

  async getLoginInfo(): Promise<IGetLoginInfoResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetLoginInfoReq,
      getLoginInfoReq: {}
    }).then(resp => resp.getLoginInfoResp || null)
      .catch(() => null)
  }

  async getStrangerInfo(userId: Long): Promise<IGetStrangerInfoResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetStrangerInfoReq,
      getStrangerInfoReq: {
        userId: userId,
      }
    }).then(resp => resp.getStrangerInfoResp || null)
      .catch(() => null)
  }

  async getFriendList(): Promise<IGetFriendListResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetFriendListReq,
      getFriendListReq: {}
    }).then(resp => resp.getFriendListResp || null)
      .catch(() => null)
  }

  async getGroupList(): Promise<IGetGroupListResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetGroupListReq,
      getGroupListReq: {}
    }).then(resp => resp.getGroupListResp || null)
      .catch(() => null)
  }

  async getGroupInfo(groupId: Long, noCache: boolean = false): Promise<IGetGroupInfoResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetGroupInfoReq,
      getGroupInfoReq: {
        groupId: groupId,
        noCache: noCache,
      }
    }).then(resp => resp.getGroupInfoResp || null)
      .catch(() => null)
  }

  async getGroupMemberInfo(groupId: Long, userId: Long, noCache: boolean = false): Promise<IGetGroupMemberInfoResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetGroupMemberInfoReq,
      getGroupMemberInfoReq: {
        groupId: groupId,
        userId: userId,
        noCache: noCache
      }
    }).then(resp => resp.getGroupMemberInfoResp || null)
      .catch(() => null)
  }

  async getGroupMemberList(groupId: Long): Promise<IGetGroupMemberListResp | null> {
    return await this.sendFrameAndWait({
      frameType: FrameType.TGetGroupMemberListReq,
      getGroupMemberListReq: {
        groupId: groupId,
      }
    }).then(resp => resp.getGroupMemberListResp || null)
      .catch(() => null)
  }
}