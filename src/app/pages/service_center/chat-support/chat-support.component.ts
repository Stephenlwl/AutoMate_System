import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceCenterChatService, ChannelData, ChatUser } from '../service-center-chat.service';
import { Channel } from 'stream-chat';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-service-center-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-support.component.html',
  styleUrls: ['./chat-support.component.css']
})
export class ServiceCenterChatComponent implements OnInit, OnDestroy {
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
  currentUser: ChatUser | null = null;
  
  // new chat modal
  showNewChatModal = false;
  newChatCustomerId = '';
  newChatCustomerName = '';
  newChatServiceRequestId = '';
  
  private subscriptions: Subscription[] = [];

  constructor(private chatService: ServiceCenterChatService) {}

  async ngOnInit() {
  // initialize the chat service
  const initialized = await this.chatService.initializeServiceCenter();
  
  if (initialized) {
    // subscribe to current user
    this.subscriptions.push(
      this.chatService.currentUser$.subscribe(user => {
        this.currentUser = user;
      })
    );
    
    // subscribe to channels
    this.subscriptions.push(
      this.chatService.channels$.subscribe(channels => {
        this.channels = channels;
        this.filterChannels(this.selectedFilter);
      })
    );
    
    // subscribe to selected channel
    this.subscriptions.push(
      this.chatService.selectedChannel$.subscribe(channel => {
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
    console.error('Failed to initialize service center chat service');
  }
}

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.chatService.disconnect();
  }

  get totalChannels(): number {
    return this.channels.length;
  }

  get adminChannelsCount(): number {
    return this.channels.filter(c => c.host_by === 'admin_support').length;
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


  useQuickResponse(response: string) {
    this.newMessage = response;
  }

  closeChat() {
    this.selectedChannel = null;
    this.selectedChannelData = null;
    this.messages = [];
  }

  // start a new chat with a customer
  async startNewCustomerChat() {
    if (!this.newChatCustomerId || !this.newChatCustomerName) return;
    
    try {
      // Use the chatService method
      const channel = await this.chatService.startCustomerChat(
        this.newChatCustomerId,
        this.newChatCustomerName,
        this.newChatServiceRequestId
      );
      
      this.showNewChatModal = false;
      this.newChatCustomerId = '';
      this.newChatCustomerName = '';
      this.newChatServiceRequestId = '';
      
      // select the new channel
      const channelId = channel.id;
      if (!channelId) {
        console.error('Cannot select channel: Channel ID is undefined');
        return;
      }
      
      await this.selectChannel(channelId);
    } catch (error) {
      console.error('Error starting new customer chat:', error);
    }
  }

  // start chat with admin
  async startAdminChat() {
    try {
      // Use the chatService method
      const channel = await this.chatService.startAdminChat();
      
      // Select the new channel
      const channelId = channel.id;
      if (!channelId) {
        console.error('Cannot select channel: Channel ID is undefined');
        return;
      }
      
      await this.selectChannel(channelId);
    } catch (error) {
      console.error('Error starting admin chat:', error);
    }
  }

  // Select a channel
  async selectChannel(channelId: string) {
    await this.chatService.selectChannel(channelId);
  }

  // Send message
  async sendMessage() {
    if (!this.newMessage?.trim() || !this.selectedChannel) return;
    
    try {
      const channelId = this.selectedChannel.id;
      if (!channelId) {
        console.error('Cannot send message: Channel ID is undefined');
        return;
      }
      
      // Use the chatService method
      await this.chatService.sendMessage(channelId, this.newMessage);
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
      const success = await this.chatService.deleteChannel(this.channelToDelete);

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

  // Load messages
  private loadMessages() {
    if (!this.selectedChannel) return;
    
    this.selectedChannel.query({
      messages: { limit: 50 }
    }).then(() => {
      this.messages = [...(this.selectedChannel?.state.messages || []) as any];
    });
  }

  // Setup channel listeners
  private setupChannelListeners() {
    if (!this.selectedChannel) return;
    
    // Listen for new messages
    this.selectedChannel.on('message.new', (event: any) => {
      if (event.message) {
        this.messages.push(event.message);
      }
    });
    
    // Listen for typing indicators
    this.selectedChannel.on('typing.start', (event: any) => {
      if (event.user?.id !== this.currentUser?.id) {
        this.isTyping = true;
      }
    });
    
    this.selectedChannel.on('typing.stop', (event: any) => {
      if (event.user?.id !== this.currentUser?.id) {
        this.isTyping = false;
      }
    });
  }

  getChannelIcon(type: string): string {
    switch (type) {
      case 'admin_support': return 'bi bi-headset';
      case 'user': return 'bi bi-person-circle';
      default: return 'bi bi-chat';
    }
  }

  getChannelTypeLabel(type: string): string {
    switch (type) {
      case 'admin_support': return 'Admin Support';
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
}