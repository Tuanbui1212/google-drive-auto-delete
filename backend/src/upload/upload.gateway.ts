import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class UploadGateway {
  @WebSocketServer()
  server: Server;

  emitFilesUpdated(email: string) {
    this.server.emit('filesUpdated', { email });
  }
}
