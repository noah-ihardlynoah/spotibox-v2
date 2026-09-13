"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";
import {
  banName,
  closeRoom,
  closeRoomOnExit,
  isNameBanned,
  roomExists,
} from "../../lib/rooms";

const MAX_NAME_LENGTH = 20;

export default function RoomMembers({ roomCode }) {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [name, setName] = useState("");
  const [joinedName, setJoinedName] = useState("");
  const [joinedRole, setJoinedRole] = useState("guest");
  const [hasAccess, setHasAccess] = useState(true);
  const [roomStatus, setRoomStatus] = useState("checking");
  const [lobbyClosed, setLobbyClosed] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [openMemberMenuId, setOpenMemberMenuId] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [requestStatus, setRequestStatus] = useState("");
  const [nameError, setNameError] = useState("");
  const [roomUrl, setRoomUrl] = useState("");
  const participantId = useRef(crypto.randomUUID());
  const joinedAt = useRef(Date.now());
  const channelRef = useRef(null);
  const hostSeen = useRef(false);
  const joinedRoleRef = useRef(joinedRole);
  const joinedNameRef = useRef(joinedName);

  joinedRoleRef.current = joinedRole;
  joinedNameRef.current = joinedName;

  useEffect(() => {
    setRoomUrl(`${window.location.origin}/${roomCode}`);
  }, [roomCode]);

  useEffect(() => {
    return () => {
      if (joinedRoleRef.current === "host" && joinedNameRef.current) {
        closeRoom(roomCode).catch(() => undefined);
      }
    };
  }, [roomCode]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoom() {
      try {
        const exists = await roomExists(roomCode);

        if (cancelled) {
          return;
        }

        if (!exists) {
          router.replace("/?error=room-not-found");
          return;
        }

        setRoomStatus("available");
        const pendingJoin = sessionStorage.getItem("spotibox:pending-join");

        if (!pendingJoin) {
          return;
        }

        try {
          const joinDetails = JSON.parse(pendingJoin);

          if (
            joinDetails.roomCode !== roomCode ||
            typeof joinDetails.name !== "string" ||
            !joinDetails.name.trim() ||
            joinDetails.name.trim().length > MAX_NAME_LENGTH
          ) {
            if (
              typeof joinDetails.name === "string" &&
              joinDetails.name.trim().length > MAX_NAME_LENGTH
            ) {
              setNameError(
                `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
              );
            }
            return;
          }

          setJoinedName(joinDetails.name);
          setJoinedRole(joinDetails.role || "guest");
          setHasAccess(joinDetails.role !== "cohost");
          sessionStorage.removeItem("spotibox:pending-join");
        } catch {
          sessionStorage.removeItem("spotibox:pending-join");
        }
      } catch {
        if (!cancelled) {
          setRoomStatus("error");
        }
      }
    }

    loadRoom();

    return () => {
      cancelled = true;
    };
  }, [roomCode, router]);

  useEffect(() => {
    if (!joinedName || roomStatus !== "available") {
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

    function rejectDuplicateName() {
      channelRef.current = null;
      supabase.removeChannel(channel);
      sessionStorage.removeItem("spotibox:pending-join");
      router.replace("/?error=name-in-use");
    }

    function hasExistingName() {
      const normalizedName = joinedName.trim().toLowerCase();

      return Object.values(channel.presenceState())
        .flat()
        .some(
          (member) =>
            member.userId !== participantId.current &&
            (member.name || "Guest").trim().toLowerCase() === normalizedName
        );
    }

    function updateMembers() {
      const presenceState = channel.presenceState();
      const currentMembers = Object.values(presenceState)
        .flat()
        .map((member) => ({
          id: member.userId,
          name: member.name || "Guest",
          role: member.role || "guest",
          joinedAt: member.joinedAt || Number.MAX_SAFE_INTEGER,
          isCurrentUser: member.userId === participantId.current,
        }))
        .sort((firstMember, secondMember) => {
          const roleOrder = { host: 0, cohost: 1, guest: 2 };

          return roleOrder[firstMember.role] - roleOrder[secondMember.role];
        });

      setMembers(currentMembers);

      const matchingNames = currentMembers
        .filter(
          (member) =>
            member.name.trim().toLowerCase() === joinedName.trim().toLowerCase()
        )
        .sort((firstMember, secondMember) => {
          if (firstMember.joinedAt !== secondMember.joinedAt) {
            return firstMember.joinedAt - secondMember.joinedAt;
          }

          return firstMember.id.localeCompare(secondMember.id);
        });

      if (
        matchingNames.length > 1 &&
        matchingNames[0].id !== participantId.current
      ) {
        rejectDuplicateName();
        return;
      }

      const hasHost = currentMembers.some((member) => member.role === "host");

      if (hasHost) {
        hostSeen.current = true;
      }
    }

    function handlePresenceLeave() {
      updateMembers();

      const hasHost = Object.values(channel.presenceState())
        .flat()
        .some((member) => member.role === "host");

      if (hostSeen.current && !hasHost) {
        setLobbyClosed(true);
        closeRoom(roomCode).catch(() => undefined);
        channelRef.current = null;
        supabase.removeChannel(channel);
      }
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
      if (payload.approved) {
        setPendingRequest((currentRequest) =>
          currentRequest?.requesterId === payload.targetId
            ? null
            : currentRequest
        );
      }

      if (payload.targetId === participantId.current) {
        if (payload.approved) {
          setRequestStatus("");
          setHasAccess(true);
        } else {
          setRequestStatus("Your co-host request was denied.");
        }
      }
    }

    function handleKick({ payload }) {
      if (payload.targetId !== participantId.current) {
        return;
      }

      setKicked(true);
      setPendingRequest(null);
      channelRef.current = null;
      supabase.removeChannel(channel);
    }

    function handleRoleChange({ payload }) {
      if (payload.targetId !== participantId.current) {
        return;
      }

      setJoinedRole(payload.role);
      setHasAccess(true);
    }

    let admissionStarted = false;

    async function admitParticipant() {
      if (admissionStarted) {
        return;
      }

      admissionStarted = true;

      try {
        if (await isNameBanned(roomCode, joinedName)) {
          setKicked(true);
          channelRef.current = null;
          await supabase.removeChannel(channel);
          return;
        }
      } catch {
        setRoomStatus("error");
        return;
      }

      if (hasExistingName()) {
        rejectDuplicateName();
        return;
      }

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
        joinedAt: joinedAt.current,
      });
    }

    channel
      .on("presence", { event: "sync" }, () => {
        updateMembers();
        admitParticipant();
      })
      .on("presence", { event: "join" }, updateMembers)
      .on("presence", { event: "leave" }, handlePresenceLeave)
      .on("broadcast", { event: "cohost-request" }, handleCohostRequest)
      .on("broadcast", { event: "cohost-response" }, handleCohostResponse)
      .on("broadcast", { event: "kick-member" }, handleKick)
      .on("broadcast", { event: "role-change" }, handleRoleChange)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          updateMembers();
        }
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [hasAccess, joinedName, joinedRole, roomCode, roomStatus]);

  useEffect(() => {
    if (!joinedName || lobbyClosed || kicked) {
      return undefined;
    }

    function confirmLeave(event) {
      if (joinedRole === "host") {
        closeRoomOnExit(roomCode);
      }
      event.preventDefault();
      event.returnValue = "";
    }

    function closeRoomWhenHidden() {
      if (joinedRole === "host") {
        closeRoomOnExit(roomCode);
      }
    }

    window.addEventListener("beforeunload", confirmLeave);
    window.addEventListener("pagehide", closeRoomWhenHidden);

    return () => {
      window.removeEventListener("beforeunload", confirmLeave);
      window.removeEventListener("pagehide", closeRoomWhenHidden);
    };
  }, [joinedName, joinedRole, kicked, lobbyClosed, roomCode]);

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

  function kickMember(member) {
    const canKick =
      member.id !== participantId.current &&
      (joinedRole === "host" ||
        (joinedRole === "cohost" && member.role === "guest"));

    if (!canKick || !channelRef.current) {
      return;
    }

    banName(roomCode, member.name)
      .then(() =>
        channelRef.current?.send({
          type: "broadcast",
          event: "kick-member",
          payload: { targetId: member.id },
        })
      )
      .catch(() => undefined);
    setOpenMemberMenuId(null);
  }

  function promoteMember(member) {
    if (
      joinedRole !== "host" ||
      member.role !== "guest" ||
      !channelRef.current
    ) {
      return;
    }

    channelRef.current.send({
      type: "broadcast",
      event: "role-change",
      payload: { targetId: member.id, role: "cohost" },
    });
    setOpenMemberMenuId(null);
  }

  function demoteMember(member) {
    if (
      joinedRole !== "host" ||
      member.role !== "cohost" ||
      !channelRef.current
    ) {
      return;
    }

    channelRef.current.send({
      type: "broadcast",
      event: "role-change",
      payload: { targetId: member.id, role: "guest" },
    });
    setOpenMemberMenuId(null);
  }

  if (roomStatus === "checking") {
    return <p>Checking room...</p>;
  }

  if (roomStatus === "missing") {
    return <p>That room does not exist.</p>;
  }

  if (roomStatus === "error") {
    return <p>Unable to verify that room.</p>;
  }

  if (kicked) {
    return <p>You have been kicked from this room.</p>;
  }

  if (lobbyClosed) {
    return <p>The room is no longer available.</p>;
  }

  function handleJoinRoom(event) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError("Enter your name before joining.");
      return;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setNameError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
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
            maxLength={MAX_NAME_LENGTH}
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
      
      <div className="room-share" aria-label="Room QR code and URL">
        {roomUrl && (
          <QRCodeSVG
            value={roomUrl}
            size={128}
            bgColor="#111111"
            fgColor="#48c866"
            title="Scan to join this room"
          />
        )}
        <p>{roomUrl}</p>
      </div>
      <h2>In this room</h2>
      <ul>
        {members.map((member) => (
          <li key={member.id}>
            {member.name}
            {member.role === "host" ? " (host)" : ""}
            {member.role === "cohost" ? " (cohost)" : ""}
            {member.isCurrentUser ? " (me)" : ""}
            {member.id !== participantId.current &&
              (joinedRole === "host" ||
                (joinedRole === "cohost" && member.role === "guest")) && (
                <span className="member-actions">
                  <button
                    className="kick-button"
                    type="button"
                    aria-label={`Actions for ${member.name}`}
                    aria-expanded={openMemberMenuId === member.id}
                    aria-haspopup="menu"
                    title={`Actions for ${member.name}`}
                    onClick={() =>
                      setOpenMemberMenuId((currentId) =>
                        currentId === member.id ? null : member.id
                      )
                    }
                  >
                    <span aria-hidden="true" />
                  </button>
                  {openMemberMenuId === member.id && (
                    <div className="member-action-menu" role="menu">
                      {joinedRole === "host" && member.role === "guest" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => promoteMember(member)}
                        >
                          Promote to Co-Host
                        </button>
                      )}
                      {joinedRole === "host" && member.role === "cohost" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => demoteMember(member)}
                        >
                          Demote to Guest
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => kickMember(member)}
                      >
                        Kick
                      </button>
                    </div>
                  )}
                </span>
              )}
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
