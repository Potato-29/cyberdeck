# Overview

[← Documentation index](README.md)

## What it is

The Cyberdeck is a rooted Android phone permanently stationed at your desk, running as an always-on Linux server. It sits silently displaying a live dashboard while handling background services — accessible from anywhere via SSH or your browser.

## Hardware

- **Device:** Android phone (ARM64)
- **Power:** Always plugged in at the desk
- **Screen:** wtfutil dashboard running 24/7
- **Input:** SSH from PC or Bluetooth keyboard

## Software stack

| Component | Purpose |
| --- | --- |
| **Termux** | Android terminal emulator; base layer for all services |
| **proot-distro Ubuntu** | Full Ubuntu inside Termux for glibc-based services |
| **wtfutil** | Terminal dashboard on the phone screen |
| **Starship** | Shell prompt styling |
| **tmux** | Terminal multiplexer; keeps services alive in named sessions |

## High-level behavior

When the phone boots, **Termux:Boot** runs the startup script automatically. The script brings up services in tmux sessions, then attaches the wtfutil dashboard to the screen. Services stay in the background; day-to-day control is via SSH from your PC.
