import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminChatService, ChannelData } from '../admin-chat.service';
import { Channel } from 'stream-chat';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-manage-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-chat.component.html',
  styleUrls: ['./manage-chat.component.css']
})
export class ManageChatComponent implements OnInit, OnDestroy {
  channels: ChannelData[] = [];
  filteredChannels: ChannelData[] = [];
  selectedChannel: Channel | null = null;
  selectedChannelData: ChannelData | null = null;
  messages: any[] = [];
  newMessage = '';
  selectedFilter = 'all';
  isTyping = false;
  showQuickResponses = true;
  showDeleteConfirm = false;
  channelToDelete: string | null = null;
  isDeleting = false;

  private subscriptions: Subscription[] = [];

  quickResponses = [
    "Thank you for contacting support. How can I help you today?",
    "I understand your concern. Let me look into this for you.",
    "Can you provide more details about the issue?",
    "I'll escalate this to our technical team.",
    "Your issue has been resolved. Is there anything else I can help with?"
  ];

  constructor(private adminChatService: AdminChatService) { }

  async ngOnInit() {
    const initialized = await this.adminChatService.initialize();

    if (initialized) {
      await this.adminChatService.loadChannels();

      // subscribe to channels
      this.subscriptions.push(
        this.adminChatService.channels$.subscribe(channels => {
          this.channels = channels;
          this.filterChannels(this.selectedFilter);
        })
      );

      // subscribe to selected channel
      this.subscriptions.push(
        this.adminChatService.selectedChannel$.subscribe(channel => {
          this.selectedChannel = channel;
          if (channel) {
            this.selectedChannelData = this.channels.find(c => c.id === channel.id) || null;
            this.loadMessages();
            this.setupChannelListeners();
          } else {
            this.selectedChannelData = null;
            this.messages = [];
          }
        })
      );
    } else {
      console.error('Failed to initialize admin chat service');
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.adminChatService.disconnect();
  }

  get totalChannels(): number {
    return this.channels.length;
  }

  filterChannels(type: string) {
    this.selectedFilter = type;

    if (type === 'all') {
      this.filteredChannels = [...this.channels];
    } else {
      this.filteredChannels = this.channels.filter(c => c.host_by === type);
    }

    // sort by last message
    this.filteredChannels.sort((a, b) => {
      const aTime = new Date(a.last_message_at || 0).getTime();
      const bTime = new Date(b.last_message_at || 0).getTime();
      return bTime - aTime;
    });

  }

  async selectChannel(channelId: string) {
    await this.adminChatService.selectChannel(channelId);
  }

  private loadMessages() {
    if (!this.selectedChannel) return;

    this.selectedChannel.query({
      messages: { limit: 50 }
    }).then(() => {
      this.messages = [...(this.selectedChannel?.state.messages || []) as any];
    });
  }

  private setupChannelListeners() {
    if (!this.selectedChannel) return;

    // listen for new messages
    this.selectedChannel.on('message.new', (event: any) => {
      if (event.message) {
        this.messages.push(event.message);
      }
    });

    // listen for typing indicators
    this.selectedChannel.on('typing.start', (event: any) => {
      if (event.user?.id !== 'admin-support') {
        this.isTyping = true;
      }
    });

    this.selectedChannel.on('typing.stop', (event: any) => {
      if (event.user?.id !== 'admin-support') {
        this.isTyping = false;
      }
    });
  }

  async sendMessage() {
    if (!this.newMessage?.trim() || !this.selectedChannel) return;

    try {
      if (this.selectedChannel?.id) {
        await this.adminChatService.sendMessage(this.selectedChannel.id, this.newMessage);
      } else {
        console.error('Selected channel ID is undefined');
      }
      this.newMessage = '';
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  confirmDeleteChannel(channelId: string, event?: Event) {
    if (event) {
      event.stopPropagation(); // for preventing channel selection
    }
    this.channelToDelete = channelId;
    this.showDeleteConfirm = true;
    this.deleteChannel();
  }

  async deleteChannel() {
    if (!this.channelToDelete) return;

    this.isDeleting = true;
    try {
      const success = await this.adminChatService.deleteChannel(this.channelToDelete);

      if (success) {
        console.log('Channel deleted successfully');
      }
    } catch (error) {
      console.error('Failed to delete channel:', error);
    } finally {
      this.isDeleting = false;
      this.showDeleteConfirm = false;
      this.channelToDelete = null;
    }
  }

  useQuickResponse(response: string) {
    this.newMessage = response;
  }

  closeChat() {
    this.selectedChannel = null;
    this.selectedChannelData = null;
    this.messages = [];
    // use the public observable instead of directly accessing the subject
    this.adminChatService.selectedChannelSubject.next(null);
  }

  getChannelIcon(type: string): string {
  switch (type) {
    case 'service_center': return 'bi bi-building';
    case 'user': return 'bi bi-person';
    default: return 'bi bi-chat';
  }
  }

  getChannelTypeLabel(type: string): string {
    switch (type) {
      case 'service_center': return 'Service Center';
      case 'user': return 'Customer';
      default: return 'Chat';
    }
  }

  formatTime(dateString: string): string {
    if (!dateString) return 'No messages';

    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString();
  }

  formatMessageTime(dateString: string | Date | undefined): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getChannelAvatarClass(type: string): string {
    switch (type) {
      case 'service_center': return 'bg-support text-white';
      case 'user': return 'bg-user text-white';
      default: return 'bg-default text-white';
    }
  }

  getChannelBadgeClass(type: string): string {
    switch (type) {
      case 'service_center': return 'badge-support';
      case 'user': return 'badge-service';
      default: return 'badge-default';
    }
  }
}