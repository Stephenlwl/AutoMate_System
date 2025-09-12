import { Injectable } from '@angular/core';
import { StreamChat, Channel, User as StreamUser, MessageResponse, UserResponse } from 'stream-chat';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ChannelData {
  id: string;
  type: string;
  name: string;
  member_count: number;
  last_message_at: string;
  host_by: string;
  custom_type?: string;
  customer_info?: {
    id: string;
    name: string;
    email?: string;
  };
  center_info?: {
    id: string;
    name: string;
  };
  service_type?: string;
  emergency_info?: {
    issue: string;
    reported_at: string;
  };
  unread_count?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminChatService {
  private client!: StreamChat;
  private baseUrl = 'http://localhost:3000';
  private channelsSubject = new BehaviorSubject<ChannelData[]>([]);
  public selectedChannelSubject = new BehaviorSubject<Channel | null>(null);
  private currentUserSubject = new BehaviorSubject<ChatUser | null>(null);
  
  private isLoading = false;
  private lastLoadTime = 0;
  
  public channels$ = this.channelsSubject.asObservable();
  public selectedChannel$ = this.selectedChannelSubject.asObservable();
  public currentUser$ = this.currentUserSubject.asObservable();
  
  constructor(private http: HttpClient) {}
  
  async initialize(): Promise<boolean> {
    try {
      // get admin token
      const tokenResponse = await this.http.post<any>(`${this.baseUrl}/admin/token`, {
        userId: 'admin-support',
        name: 'Support Admin',
        role: 'admin'
      }).toPromise();
      
      this.client = StreamChat.getInstance('3mj9hufw92nk');
      
      const adminUser: UserResponse = {
        id: 'admin-support',
        name: 'Support Administrator',
        role: 'admin',
        image: 'https://i.imgur.com/fR9Jz14.png'
      };
      
      await this.client.connectUser(adminUser, tokenResponse.token);

      this.currentUserSubject.next({
        id: 'admin-support',
        name: 'Support Administrator',
        role: 'admin'
      });

      this.startChannelListener();
      return true;
    } catch (error) {
      console.error('Admin chat initialization error:', error);
      return false;
    }
  }

  private startChannelListener() {
    this.client.on('notification.channel_deleted', (event) => {
      this.loadChannels();
    });
    
    this.client.on('notification.message_new', (event) => {
      // load new message
      this.loadChannels();
    });
  }

  // add debounced load method
  async loadChannelsDebounced(type?: string): Promise<void> {
    const now = Date.now();
    const timeSinceLastLoad = now - this.lastLoadTime;
    
    // prevent too frequent requests min 2 seconds between requests
    if (this.isLoading || timeSinceLastLoad < 2000) {
      return;
    }
    
    this.isLoading = true;
    try {
      await this.loadChannels(type);
      this.lastLoadTime = Date.now();
    } catch (error) {
      console.error('Error loading channels:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadChannels(type?: string): Promise<void> {
    try {
      const currentUser = this.currentUserSubject.value;
      const filter: any = {
        type: 'messaging',
        members: { $in: ['admin-support'] }};
      if (type && type !== 'all') {
        filter.type = type;
      }
      
      const sort = [{ last_message_at: -1 }];
      const channels = await this.client.queryChannels(filter, sort, {
        watch: true,
        state: true,
      });
      
      // Convert to ChannelData format
      const channelData: ChannelData[] = channels.map(channel => {
        const data = channel.data as any;
        
        return {
          id: channel.id || '',
          type: data?.type || 'support',
          custom_type: data?.custom_type || 'support',
          host_by: data?.host_by || 'user',
          name: data?.service_center_info?.name || data?.customer_info?.name || 'Unknown',
          member_count: data?.member_count || 0,
          last_message_at: data?.last_message_at || new Date().toISOString(),
          customer_info: data?.customer_info,
          center_info: data?.center_info,
          service_type: data?.service_type,
          emergency_info: data?.emergency_info,
          unread_count: channel.countUnread(),
        };
      });
      
      this.channelsSubject.next(channelData);
    } catch (error) {
      console.error('Error loading channels:', error);
      throw error;
    }
  }

  async selectChannel(channelId: string): Promise<void> {
    try {
      const filter = { id: { $eq: channelId } };
      const channels = await this.client.queryChannels(filter, {}, { watch: true, state: true });
      
      if (channels.length > 0) {
        this.selectedChannelSubject.next(channels[0]);
        // mark as read
        await channels[0].markRead();
        // refresh channels to update unread count
        this.loadChannels();
      }
    } catch (error) {
      console.error('Error selecting channel:', error);
    }
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    try {
      const channel = this.client.channel('messaging', channelId);
      await channel.sendMessage({ text });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async deleteChannel(channelId: string): Promise<boolean> {
    try {
      const response = await this.http.post<any>(
        `${this.baseUrl}/channels/delete`,
        { channelId }
      ).toPromise();

      if (response.success) {
        // If the deleted channel was currently selected, clear selection
        if (this.selectedChannelSubject.value?.id === channelId) {
          this.selectedChannelSubject.next(null);
        }
        
        // Reload channels list
        await this.loadChannels();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting channel via backend:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
    }
  }

  getCurrentUser(): ChatUser | null {
    return this.currentUserSubject.value;
  }
}

export interface ChatUser {
  id: string;
  name: string;
  role: 'admin' | 'service_center' | 'user';
  image?: string;
}