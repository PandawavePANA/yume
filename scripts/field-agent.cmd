@echo off
chcp 65001 >nul
rem 유메 현장 요원 — 근무 시간(06:00~19:30) 동안 감사팀이 맡긴 답 수집을 한다. 이 창을 닫으면 멈춘다.
rem 감사 번호를 붙이면(예: field-agent.cmd 31) 그 서비스를 보이는 창으로 열어 회원가입·로그인을 한다.
title YUME field agent
cd /d "%~dp0.."
if "%~1"=="" (
  railway run --service yume node scripts/field-agent.mjs
) else (
  railway run --service yume node scripts/field-agent.mjs --open %~1
)
pause
