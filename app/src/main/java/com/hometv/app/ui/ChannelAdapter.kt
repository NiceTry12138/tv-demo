package com.hometv.app.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.hometv.app.R
import com.hometv.app.data.Channel
import com.hometv.app.databinding.ItemChannelBinding

class ChannelAdapter(
    private val onChannelSelected: (Int) -> Unit
) : ListAdapter<Channel, ChannelAdapter.ChannelViewHolder>(ChannelDiffCallback) {
    var selectedIndex: Int = RecyclerView.NO_POSITION
        private set(value) {
            val previous = field
            field = value
            if (previous in 0 until itemCount) notifyItemChanged(previous)
            if (value in 0 until itemCount) notifyItemChanged(value)
        }

    fun submitChannels(channels: List<Channel>, selectedIndex: Int, onCommitted: () -> Unit) {
        submitList(channels) {
            this.selectedIndex = selectedIndex
            onCommitted()
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelViewHolder {
        val binding = ItemChannelBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ChannelViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ChannelViewHolder, position: Int) {
        holder.bind(getItem(position), position, position == selectedIndex)
    }

    inner class ChannelViewHolder(
        private val binding: ItemChannelBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(channel: Channel, position: Int, selected: Boolean) {
            binding.channelNumber.text = (position + 1).toString().padStart(3, '0')
            binding.channelName.text = channel.name
            binding.channelGroup.text = channel.group
            binding.root.isSelected = selected
            binding.root.contentDescription = binding.root.context.getString(
                R.string.channel_item_description,
                channel.name
            )
            binding.root.setOnClickListener { onChannelSelected(bindingAdapterPosition) }
            binding.root.setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) binding.root.bringToFront()
            }
        }
    }

    private object ChannelDiffCallback : DiffUtil.ItemCallback<Channel>() {
        override fun areItemsTheSame(oldItem: Channel, newItem: Channel): Boolean =
            oldItem.id == newItem.id

        override fun areContentsTheSame(oldItem: Channel, newItem: Channel): Boolean =
            oldItem == newItem
    }
}
