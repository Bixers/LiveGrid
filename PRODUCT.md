# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web interface for an Electron desktop shell.

## Stack

TypeScript, Vite, Electron, HLS.js, and mpegts.js backed by a local packaged HTTP service. The interface remains buildable as static files for development and is packaged as a Windows desktop application for distribution.

## Users

Chinese-speaking live-stream operators who monitor several Douyu rooms for long sessions and need to detect stream state changes quickly.

## Product Purpose

Provide one operational workspace for adding rooms, viewing multiple live streams, changing stream quality, reading danmaku events, and checking room-level activity without switching browser tabs.

## Positioning

The product combines a local multi-stream canvas with room controls and event visibility in one desktop surface while keeping room and layout preferences on the device.

## Operating Context

Primarily desktop use at 1280x800 and larger, with responsive support for narrow windows. Users need compact controls, stable layouts, visible service health, and clear recovery when a stream or the local service fails.

## Capabilities and Constraints

- Preserve `/streams.json`, `/status`, `/add`, `/remove`, `/refresh`, `/quality`, `/danmaku`, `/api/stats`, and `/api/events` contracts.
- Preserve HLS and HTTP-FLV playback compatibility.
- Treat the supplied C# shell and Python service as compiled artifacts; this source replaces the web UI and documents the integration boundary.
- Remove original visible product attribution, account tier copy, unrelated websites, and unsolicited remote chat.
- Preserve third-party license notices required by dependencies.
- Do not invent commercial claims, customer data, or operational metrics.
- Use `监控室` as the Chinese display name and `LiveGrid` as the English and technical name.

## Product Principles

- Put stream state and recovery ahead of decoration.
- Keep frequent room actions one interaction away.
- Make empty, loading, stale, and failed states explicit.
- Persist operator preferences locally and avoid silent external connections.
- Keep the video canvas as the primary workspace through progressive disclosure.

## Accessibility & Inclusion

Support keyboard operation, visible focus, reduced motion, WCAG AA text contrast, and concise Chinese labels.
