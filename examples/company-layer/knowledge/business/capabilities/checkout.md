---
capability: checkout
owner: team-growth
kpi: conversion_rate
baseline: "3.2%"
revenue_link: direct
services: [acme-web, acme-orders, acme-billing]
---
Converts a quote into a booked shipment. Every 0.1pp of conversion is roughly ₹4L/month.
Latency above 800ms measurably drops conversion.

A spec touching any of these services should state its expected effect on `conversion_rate`.
