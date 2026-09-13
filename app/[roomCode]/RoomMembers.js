"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function RoomMembers({ roomCode }) {
  const [members, setMembers] = useState([]);
  const [name, setName] = useState("");
  const [joinedName, setJoinedName] = useState("");
  const [joinedRole, setJoinedRole] = useState("guest");
  const [hasAccess, setHasAccess] = useState(true);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [requestStatus, setRequestStatus] = useState("");
  const [nameError, setNameError] = useState("");
  const participantId = useRef(crypto.randomUUID());
  const channelRef = useRef(null);

  useEffect(() => {
    const pendingJoin = sessionStorage.getItem("spotibox:pending-join");

    if (!pendingJoin) {
      return;
    }

    try {
      const joinDetails = JSON.parse(pendingJoin);

      if (joinDetails.roomCode !== roomCode || !joinDetails.name) {
        return;
      }

      setJoinedName(joinDetails.name);
      setJoinedRole(joinDetails.role || "guest");
      setHasAccess(joinDetails.role !== "cohost");
      sessionStorage.removeItem("spotibox:pending-join");
    } catch {
      sessionStorage.removeItem("spotibox:pending-join");
    }
  }, [roomCode]);

  useEffect(() => {
    if (!joinedName) {
      return undefined;
    }

    const channel = supabase.channel(`room:${roomCode}`, {
      config: {
        presence: {
          key: participantId.current,
        },
      },
    });
    channelRef.current = channel;

    function updateMembers() {
      const presenceState = channel.presenceState();
      const currentMembers = Object.values(presenceState)
        .flat()
        .map((member) => ({
          id: member.userId,
          name: member.name || "Guest",
          role: member.role || "guest",
          isCurrentUser: member.userId === participantId.current,
        }))
        .sort((firstMember, secondMember) => {
          const roleOrder = { host: 0, cohost: 1, guest: 2 };

          return roleOrder[firstMember.role] - roleOrder[secondMember.role];
        });

      setMembers(currentMembers);
    }

    function handleCohostRequest({ payload }) {
      if (
        hasAccess &&
        (joinedRole === "host" || joinedRole === "cohost")
      ) {
        setPendingRequest(payload);
      }
    }

    function handleCohostResponse({ payload }) {
      if (payload.targetId !== participantId.current) {
        return;
      }

      if (payload.approved) {
        setRequestStatus("");
        setHasAccess(true);
      } else {
        setRequestStatus("Your co-host request was denied.");
      }
    }

    channel
      .on("presence", { event: "sync" }, updateMembers)
      .on("presence", { event: "join" }, updateMembers)
      .on("presence", { event: "leave" }, updateMembers)
      .on("broadcast", { event: "cohost-request" }, handleCohostRequest)
      .on("broadcast", { event: "cohost-response" }, handleCohostResponse)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          if (joinedRole === "cohost" && !hasAccess) {
            await channel.send({
              type: "broadcast",
              event: "cohost-request",
              payload: {
                requesterId: participantId.current,
                requesterName: joinedName,
              },
            });
            setRequestStatus("Waiting for host approval...");
            return;
          }

          await channel.track({
            userId: participantId.current,
            name: joinedName,
            role: joinedRole,
          });
        }
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [hasAccess, joinedName, joinedRole, roomCode]);

  function respondToCohostRequest(approved) {
    if (!pendingRequest || !channelRef.current) {
      return;
    }

    channelRef.current.send({
      type: "broadcast",
      event: "cohost-response",
      payload: {
        targetId: pendingRequest.requesterId,
        approved,
      },
    });
    setPendingRequest(null);
  }

  function handleJoinRoom(event) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError("Enter your name before joining.");
      return;
    }

    setNameError("");
    setJoinedName(trimmedName);
    setJoinedRole("guest");
    setHasAccess(true);
  }

  if (!joinedName) {
    return (
      <>
        <h2>Join this room</h2>
        <form className="room-name-form" onSubmit={handleJoinRoom}>
          <input
            className="menu-input"
            type="text"
            placeholder="Enter your name"
            aria-label="Name"
            value={name}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => {
              setName(event.target.value);
              setNameError("");
            }}
          />
          <button type="submit">Join Room</button>
          {nameError && <p className="input-error">{nameError}</p>}
        </form>
      </>
    );
  }

  if (!hasAccess) {
    return (
      <>
        <h2>Waiting for approval</h2>
        <p>{requestStatus}</p>
      </>
    );
  }

  return (
    <>
      <h2>In this room</h2>
      <ul>
        {members.map((member) => (
          <li key={member.id}>
            {member.name}
            {member.role === "host" ? " (host)" : ""}
            {member.role === "cohost" ? " (cohost)" : ""}
            {member.isCurrentUser ? " (me)" : ""}
          </li>
        ))}
      </ul>
      {pendingRequest && (
        <div className="approval-popup" role="dialog" aria-modal="true">
          <h3>Co-host request</h3>
          <p>{pendingRequest.requesterName} wants to join as a co-host.</p>
          <div className="approval-actions">
            <button type="button" onClick={() => respondToCohostRequest(true)}>
              Approve
            </button>
            <button type="button" onClick={() => respondToCohostRequest(false)}>
              Deny
            </button>
          </div>
        </div>
      )}
    </>
  );
}
